/* Gahlendorf-Kern: Arbeitsmappe im Rechenkern halten, ändern, protokollieren,
   serialisieren. Läuft im Web Worker der App und in Node (Tests, Chat-Werkzeug).
   Alle Änderungen laufen als OPERATIONEN (op) – dieselben Ops werden lokal
   ausgeführt, im Journal gespeichert und bei einem Sync-Konflikt auf die frische
   Fassung erneut angewandt. */
(function(root,f){ if(typeof module==='object'&&module.exports) module.exports=f(require('./engine.js'),require('./wbcodec.js')); else root.GCore=f(root.GEngine,root.WBCodec); })(typeof self!=='undefined'?self:this,function(E,C){
  const VERSION='1.0.1';
  // Schlüsselspalten: Zeilen werden über ihre ID gefunden, nicht über die Position
  const KEYS={'Renovierungsplan':0,'Kostenplan':0,'Wissensspeicher':0,'Kontakte':0,'Kosten':null};
  const toHF=v=>{ if(typeof v==='string'){ if(v[0]==='=') return v; return "'"+(v[0]==="'"?v.slice(1):v); } return v===undefined?null:v; };
  const fromHF=v=>{ if(typeof v==='string'&&v[0]==="'") { const s=v.slice(1); return (s[0]==='='||s[0]==="'")?"'"+s:s; } return v===undefined?null:v; };
  const plainVal=v=>{ if(v&&typeof v==='object'){ if('value' in v&&'type' in v) return {e:v.value}; } return v===undefined?null:v; };
  const today=()=>{const d=new Date();return d.getDate().toString().padStart(2,'0')+'.'+(d.getMonth()+1).toString().padStart(2,'0')+'.'+d.getFullYear()};
  const serial=(d)=>E.serialOf(d||new Date());
  class Book{
    constructor(wb){ this.wb=wb.schema===2?C.decode(wb):wb; this.hf=null; this.idx={}; this.wb.sheets.forEach((s,i)=>this.idx[s.name]=i); }
    build(){ const data={}; for(const s of this.wb.sheets) data[s.name]=s.inp.map(r=>r.map(toHF));
      this.hf=E.HyperFormula.buildFromSheets(data,E.CONFIG); return this; }
    sid(name){ const id=this.hf.getSheetId(name); if(id===undefined) throw new Error('Blatt fehlt: '+name); return id; }
    value(sheet,r,c){ return plainVal(this.hf.getCellValue({sheet:this.sid(sheet),row:r,col:c})); }
    input(sheet,r,c){ return fromHF(this.hf.getCellSerialized({sheet:this.sid(sheet),row:r,col:c})); }
    isFormula(sheet,r,c){ const x=this.input(sheet,r,c); return typeof x==='string'&&x[0]==='='; }
    height(sheet){ return this.hf.getSheetDimensions(this.sid(sheet)).height; }
    findRow(sheet,col,val){ const h=this.height(sheet); const id=this.sid(sheet);
      for(let r=0;r<h;r++){ const v=plainVal(this.hf.getCellValue({sheet:id,row:r,col})); if(v===val||(v!=null&&val!=null&&String(v)===String(val))) return r; } return -1; }
    lastRow(sheet,col){ const h=this.height(sheet); const id=this.sid(sheet); for(let r=h-1;r>=0;r--){ const v=this.hf.getCellSerialized({sheet:id,row:r,col}); if(v!==null&&v!==undefined&&v!=='') return r; } return -1; }
    maxNum(sheet,col){ const h=this.height(sheet); const id=this.sid(sheet); let m=0; for(let r=0;r<h;r++){ const v=this.hf.getCellValue({sheet:id,row:r,col}); if(typeof v==='number'&&v>m) m=v; } return m; }
    setRaw(sheet,r,c,input){ const ch=this.hf.setCellContents({sheet:this.sid(sheet),row:r,col:c},[[toHF(input)]]); return ch; }
    // Zeile kopieren wie in LibreOffice (relative Bezüge wandern mit). Liest zuerst, schreibt dann –
    // daher auch innerhalb eines batch() nutzbar, wenn rowInputs() vorher geholt wurde.
    rowInputs(sheet,from,ncols){ const id=this.sid(sheet); const w=ncols||this.hf.getSheetDimensions(id).width; const out=[];
      for(let c=0;c<w;c++) out.push(fromHF(this.hf.getCellSerialized({sheet:id,row:from,col:c}))); return out; }
    writeRowShifted(sheet,inputs,from,to){ inputs.forEach((x,c)=>{ if(typeof x==='string'&&x[0]==='=') x='='+C.dec(C.enc(x.slice(1),from,c),to,c); this.setRaw(sheet,to,c,x); }); }
    copyRow(sheet,from,to,ncols){ const ins=this.rowInputs(sheet,from,ncols); this.batch(()=>this.writeRowShifted(sheet,ins,from,to)); }
    // ---------- Operationen ----------
    resolveRow(op){ if(op.key!==undefined&&op.key!==null&&KEYS[op.sheet]!=null){ const r=this.findRow(op.sheet,KEYS[op.sheet],op.key); if(r>=0) return r; } return op.r; }
    apply(op){
      switch(op.op){
        case 'set': { const r=this.resolveRow(op); const old=this.input(op.sheet,r,op.c); if(op.log!==false) this.logRow(); if(op.log!==false) this._logR--;
          this.batch(()=>{ this.setRaw(op.sheet,r,op.c,op.input);
            if(op.log!==false) this.log(op.sheet+' '+C.colStr(op.c)+(r+1)+(op.key!=null?' (Nr. '+op.key+')':'')+': '+short(old)+' → '+short(op.input),op.key,op.who); });
          return {r}; }
        case 'sets': { // mehrere Zellen einer Zeile in EINEM Rechengang (Formular speichern, Status + Datum)
          const r=this.resolveRow(op); const olds={}; for(const c in op.cells) olds[c]=this.input(op.sheet,r,Number(c)); this.logRow(); this._logR--;
          this.batch(()=>{ const parts=[]; for(const c in op.cells){ this.setRaw(op.sheet,r,Number(c),op.cells[c]); parts.push(C.colStr(Number(c))+(r+1)+': '+short(olds[c])+' → '+short(op.cells[c])); }
            if(op.log!==false) this.log(op.sheet+(op.key!=null?' (Nr. '+op.key+')':'')+' '+parts.join('; '),op.key,op.who); });
          return {r}; }
        case 'version': { // Versionspflege wie bisher (Übersicht B3/C3, Legende A1, Arbeitsweise B12, Stand der Dinge A1)
          const old=String(this.value('Übersicht',2,1)||''); const nv=op.to; const by=op.by||'Renovierungsplan-Chat'; const d=op.date||today();
          const pre=[['Legende',0,0],['Stand der Dinge',0,0]].map(([sh,r,c])=>[sh,r,c,this.input(sh,r,c)]);
          this.logRow(); this._logR--;
          this.batch(()=>{ this.setRaw('Übersicht',2,1,nv); this.setRaw('Übersicht',2,2,'Arbeitsmappe: Repo Gahlendorf-Daten/workbook.json (Verlauf: GitHub-Commits)');
            for(const [sh,r,c,x] of pre) if(typeof x==='string'&&old&&x.includes(old)) this.setRaw(sh,r,c,x.split(old).join(nv));
            this.setRaw('Arbeitsweise',11,1,'Version '+nv+' am '+d+' ('+by+')');
            this.log('Übersicht B3/C3, Legende A1, Arbeitsweise B12, Stand der Dinge A1',null,by); });
          return {from:old,to:nv}; }
        case 'task': return this.newTask(op);
        case 'ws': return this.newWS(op);
        case 'row': { // generische neue Zeile am Ende eines Blattes (Kontakte, Einkaufsliste …)
          const lr=this.lastRow(op.sheet,op.col||0); const r=lr+1; this.logRow(); this._logR--;
          const row=op.copyFormulas&&lr>=0?this.rowInputs(op.sheet,lr).map((x,c)=>typeof x==='string'&&x[0]==='='?'='+C.dec(C.enc(x.slice(1),lr,c),r,c):null):[];
          for(const k in op.fields) row[Number(k)]=op.fields[k];
          this.batch(()=>{ row.forEach((v,c)=>{ if(v!==undefined) this.setRaw(op.sheet,r,c,v); }); this.log('Neue Zeile '+op.sheet+' '+(r+1),null,op.who); }); return {r}; }
        default: throw new Error('unbekannte Operation '+op.op);
      }
    }
    newTask(op){ // wie newtask() im ODS-Werkzeug: letzte Aufgabenzeile mit Formeln kopieren
      const S='Renovierungsplan'; let lr=-1; const h=this.height(S); const id=this.sid(S);
      for(let r=1;r<h;r++){ const v=this.hf.getCellValue({sheet:id,row:r,col:0}); if(typeof v==='number'&&v>0) lr=r; }
      const r=lr+1; const nr=op.nr||this.maxNum(S,0)+1; this.logRow(); this._logR--;
      const F=Object.assign({C:'offen',T:'beide',O:'Lars'},op.fields||{}); F.A=nr;
      // Zeile fertig zusammenstellen und jede Zelle GENAU EINMAL schreiben (HyperFormula verträgt im batch kein Überschreiben frischer Formeln)
      const row=this.rowInputs(S,lr,34).map((x,c)=>typeof x==='string'&&x[0]==='='?'='+C.dec(C.enc(x.slice(1),lr,c),r,c):x);
      for(const c of [7,13,15,29,25,24,22]) row[c]=null; // H N P AD Z Y W leeren (wie newtask im ODS-Werkzeug)
      for(const k in F){ let v=F[k]; if(typeof v==='string'&&/^\d{2}\.\d{2}\.\d{4}$/.test(v)){ const [d,m,y]=v.split('.').map(Number); v=serial(new Date(y,m-1,d)); } row[C.colNum(k)]=v; }
      this.batch(()=>{ row.forEach((v,c)=>this.setRaw(S,r,c,v));
        this.log('Neue Aufgabe '+nr+': '+short(F.B||''),nr,op.who); }); return {r,nr};
    }
    newWS(op){ const S='Wissensspeicher'; const lr=this.lastRow(S,0); const r=lr+1; this.logRow(); this._logR--;
      const prev=String(this.input(S,lr,0)||'W0000'); const n=(parseInt(prev.replace(/\D/g,''),10)||0)+1; const wid=op.id||('W'+String(n).padStart(4,'0'));
      const F=op.fields||{}; const row=[wid,F.datum||today(),F.nr||null,F.thema||'',F.typ||'Hinweis',F.inhalt||'',F.quelle||'',F.status||'aktuell',F.aufgabe||''];
      this.batch(()=>{ row.forEach((v,c)=>this.setRaw(S,r,c,v)); this.log('Wissensspeicher '+wid+': '+short(F.inhalt||''),F.nr,op.who); }); return {r,id:wid}; }
    logRow(){ const S='Aenderungsprotokoll'; if(this.hf.getSheetId(S)===undefined) return -1; if(this._logR===undefined) this._logR=this.lastRow(S,0); return ++this._logR; }
    log(text,nr,who){ const S='Aenderungsprotokoll'; const r=this.logRow(); if(r<0) return;
      [ '['+(who||'PWA')+'] '+text,'-','-',nr==null?'-':String(nr),today() ].forEach((v,c)=>this.setRaw(S,r,c,v)); }
    // Alle Lesezugriffe VOR dem Block, Schreibzugriffe gesammelt: HyperFormula rechnet dann nur einmal.
    batch(fn){ let out; this.hf.batch(()=>{ out=fn(); }); return out; }
    // ---------- Serialisieren ----------
    snapshot(meta){ const sheets=this.wb.sheets.map(s=>{ const id=this.sid(s.name); const inp=this.hf.getSheetSerialized(id).map(r=>r.map(fromHF)); const vals=this.hf.getSheetValues(id);
        const val=inp.map((row,r)=>row.map((x,c)=>typeof x==='string'&&x[0]==='='?plainVal(vals[r][c]):null));
        return Object.assign({},s,{inp,val}); });
      return Object.assign({},this.wb,{sheets},meta||{}); }
    encoded(meta){ return C.encode(this.snapshot(meta)); }
  }
  const short=v=>{ v=v==null?'':String(v); return v.length>60?v.slice(0,57)+'…':v; };
  return {Book,VERSION,KEYS,toHF,fromHF,today,serial};
});
