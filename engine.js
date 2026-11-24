/* Gahlendorf-Engine: HyperFormula + Zusatzfunktionen, damit die Formeln der
   früheren Fehmarn.ods unverändert weiterrechnen. Läuft in Node (Tests) und im
   Browser (Web Worker). */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('hyperformula'));
  else root.GEngine=factory(root.HyperFormula);
})(typeof self!=='undefined'?self:this,function(HFmod){
  const HyperFormula=HFmod.HyperFormula||HFmod;
  const {FunctionPlugin,FunctionArgumentType:A,CellError,ErrorType,ArraySize,SimpleRangeValue}=HFmod;
  let TODAY_SERIAL=null; // null = echtes Heute
  const serialOf=(d)=>Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(1899,11,30))/864e5);
  const isRange=v=>v&&typeof v.iterateValuesFromTopLeftCorner==='function';
  const flat=v=>(isRange(v)?Array.from(v.iterateValuesFromTopLeftCorner()):[v]).map(x=>typeof x==='symbol'?null:x);
  const raw=v=>typeof v==='symbol'?null:((v&&typeof v==='object'&&'val' in v)?v.val:v); // ExtendedNumber
  const num=v=>{v=raw(v);return typeof v==='number'?v:(typeof v==='boolean'?(v?1:0):null)};
  let FIXED_LOCALE='en-US';
  class GPlugin extends FunctionPlugin{
    n(ast,state){return this.runFunction(ast.args,state,this.metadata('N'),(v)=>{
      if(isRange(v)) v=flat(v)[0];
      if(v instanceof CellError) return v;
      v=raw(v); if(typeof v==='number') return v; if(typeof v==='boolean') return v?1:0; return 0;})}
    textjoin(ast,state){return this.runFunction(ast.args,state,this.metadata('TEXTJOIN'),(d,ign,...vals)=>{
      if(d instanceof CellError) return d; d=String(raw(d)??''); ign=!!raw(ign);
      const out=[]; for(const v of vals){for(let x of flat(v)){if(x instanceof CellError) return x; x=raw(x);
        if(x===null||x===undefined) x=''; if(typeof x==='boolean') x=x?'TRUE':'FALSE'; x=String(x);
        if(ign&&x==='') continue; out.push(x);}}
      return out.join(d);})}
    lookup(ast,state){return this.runFunction(ast.args,state,this.metadata('LOOKUP'),(key,vec,res)=>{
      if(key instanceof CellError) return key; key=raw(key);
      const kv=flat(vec), rv=res===undefined?null:flat(res);
      let pos=-1;
      for(let i=0;i<kv.length;i++){let x=kv[i]; if(x instanceof CellError) continue; x=raw(x);
        if(x===null||x===undefined||x==='') continue;
        if(typeof key==='number'&&typeof x==='number'&&x<=key) pos=i;
        else if(typeof key==='string'&&typeof x==='string'&&x.toLowerCase()<=key.toLowerCase()) pos=i;}
      if(pos<0) return new CellError(ErrorType.NA);
      const out=rv?rv[pos]:kv[pos]; return out===undefined||out===null?'':out;})}
    rank(ast,state){return this.runFunction(ast.args,state,this.metadata('RANK'),(v,ref,ord)=>{
      if(v instanceof CellError) return v; v=num(v); const o=ord===undefined?0:num(ord);
      let c=1,found=false; for(let x of flat(ref)){x=num(x); if(x===null) continue; if(x===v) found=true; if(o?x<v:x>v) c++;}
      return found?c:new CellError(ErrorType.NA);})}
    fixed(ast,state){return this.runFunction(ast.args,state,this.metadata('FIXED'),(v,dec,noc)=>{
      if(v instanceof CellError) return v; v=num(v); dec=dec===undefined?2:num(dec); noc=noc===undefined?false:!!raw(noc);
      const f=Math.pow(10,dec); const r=Math.round(v*f)/f;
      return r.toLocaleString(FIXED_LOCALE,{minimumFractionDigits:Math.max(0,dec),maximumFractionDigits:Math.max(0,dec),useGrouping:!noc});})}
    averageifs(ast,state){return this.runFunction(ast.args,state,this.metadata('AVERAGEIFS'),(avg,...p)=>{
      const h=condAgg(p); if(h instanceof CellError) return h; const v=grid(avg); let t=0,n=0; for(const k of h){const x=raw(at(v,k)); if(typeof x==='number'){t+=x;n++;}} return n?t/n:new CellError(ErrorType.DIV_BY_ZERO);})}
    value(ast,state){return this.runFunction(ast.args,state,this.metadata('VALUE'),(v)=>{
      if(isRange(v)) v=flat(v)[0]; if(v instanceof CellError) return v; v=raw(v);
      if(typeof v==='number') return v; if(typeof v==='boolean') return v?1:0; if(v==null||v==='') return 0;
      const t=String(v).trim().replace(/,/g,''); if(/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?%?$/.test(t)) return t.endsWith('%')?Number(t.slice(0,-1))/100:Number(t);
      const d=String(v).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if(d) return Math.round((Date.UTC(+d[3],+d[2]-1,+d[1])-Date.UTC(1899,11,30))/864e5);
      return new CellError(ErrorType.VALUE);})}
    countif(ast,state){return this.runFunction(ast.args,state,this.metadata('COUNTIF'),(r,c)=>{const h=condAgg([r,c]); return h instanceof CellError?h:h.length;})}
    countifs(ast,state){return this.runFunction(ast.args,state,this.metadata('COUNTIFS'),(...p)=>{const h=condAgg(p); return h instanceof CellError?h:h.length;})}
    sumif(ast,state){return this.runFunction(ast.args,state,this.metadata('SUMIF'),(r,c,s)=>{const h=condAgg([r,c]); if(h instanceof CellError) return h; return sumAt(grid(s===undefined?r:s),h);})}
    sumifs(ast,state){return this.runFunction(ast.args,state,this.metadata('SUMIFS'),(s,...p)=>{const h=condAgg(p); if(h instanceof CellError) return h; return sumAt(grid(s),h);})}
    averageif(ast,state){return this.runFunction(ast.args,state,this.metadata('AVERAGEIF'),(r,c,s)=>{const h=condAgg([r,c]); if(h instanceof CellError) return h; const v=grid(s===undefined?r:s); let t=0,n=0; for(const k of h){const x=raw(at(v,k)); if(typeof x==='number'){t+=x;n++;}} return n?t/n:new CellError(ErrorType.DIV_BY_ZERO);})}
    match(ast,state){return this.runFunction(ast.args,state,this.metadata('MATCH'),(key,rng,type)=>{
      if(key instanceof CellError) return key; if(isRange(key)) key=flat(key)[0]; key=raw(key); type=type===undefined?1:num(type);
      const g=grid(rng); const v={length:g.n}; const get=i=>at(g,i);
      if(type===0){ let f;
        if(typeof key==='string'){ const re=/[*?~]/.test(key)?wild(key):null; const lk=key.toLowerCase();
          f=x=>{x=raw(x); return typeof x==='string'&&(re?re.test(x):x.toLowerCase()===lk);}; }
        else if(typeof key==='number') f=x=>{x=raw(x); return typeof x==='number'&&Math.abs(x-key)<1e-12;};
        else if(typeof key==='boolean') f=x=>raw(x)===key; else f=x=>false;
        for(let i=0;i<v.length;i++) if(f(get(i))) return i+1; return new CellError(ErrorType.NA); }
      let pos=-1; const cmp=(x)=>{x=raw(x); if(typeof key==='number') return typeof x==='number'?(x<key?-1:x>key?1:0):null;
        if(typeof key==='string') return typeof x==='string'?(x.toLowerCase()<key.toLowerCase()?-1:x.toLowerCase()>key.toLowerCase()?1:0):null; return null;};
      for(let i=0;i<v.length;i++){const c=cmp(get(i)); if(c===null) continue; if(type>0){ if(c<=0) pos=i; else break; } else { if(c>=0) pos=i; else break; } }
      return pos<0?new CellError(ErrorType.NA):pos+1;})}
    roundup(ast,state){return this.runFunction(ast.args,state,this.metadata('ROUNDUP'),(v,d)=>{ if(v instanceof CellError) return v; v=approx(num(v)); d=d===undefined?0:num(d); const f=Math.pow(10,d); const r=Math.ceil(Math.abs(v)*f-1e-9)/f; return v<0?-r:r;})}
    rounddown(ast,state){return this.runFunction(ast.args,state,this.metadata('ROUNDDOWN'),(v,d)=>{ if(v instanceof CellError) return v; v=approx(num(v)); d=d===undefined?0:num(d); const f=Math.pow(10,d); const r=Math.floor(Math.abs(v)*f+1e-9)/f; return v<0?-r:r;})}
    irr(ast,state){return this.runFunction(ast.args,state,this.metadata('IRR'),(r,g)=>{
      const cf=flat(r).map(raw).filter(x=>typeof x==='number'); let x=g===undefined?0.1:num(g);
      for(let it=0;it<100;it++){let f=0,df=0; for(let t=0;t<cf.length;t++){const d=Math.pow(1+x,t); f+=cf[t]/d; df-=t*cf[t]/(d*(1+x));}
        if(Math.abs(df)<1e-15) break; const nx=x-f/df; if(!isFinite(nx)) break; if(Math.abs(nx-x)<1e-10) return nx; x=nx;}
      return new CellError(ErrorType.NUM);})}
    rowArr(ast,state){ let a=ast.args[0]; while(a&&a.type==='PARENTHESIS') a=a.expression;
      if(!a) return state.formulaAddress.row+1;
      if(a.type==='CELL_RANGE'){ const r0=a.start.toSimpleCellAddress(state.formulaAddress).row, r1=a.end.toSimpleCellAddress(state.formulaAddress).row;
        if(r1>r0){ const out=[]; for(let r=r0;r<=r1;r++) out.push([r+1]); return SimpleRangeValue.onlyNumbers(out);} return r0+1; }
      if(a.type==='CELL_REFERENCE') return a.reference.toSimpleCellAddress(state.formulaAddress).row+1;
      return new CellError(ErrorType.VALUE); }
    rowArrSize(ast,state){ let a=ast.args[0]; while(a&&a.type==='PARENTHESIS') a=a.expression;
      if(a&&a.type==='CELL_RANGE'){ const r0=a.start.toSimpleCellAddress(state.formulaAddress).row, r1=a.end.toSimpleCellAddress(state.formulaAddress).row; return new ArraySize(1,r1-r0+1);} return ArraySize.scalar(); }
    minifs(ast,state){return this.runFunction(ast.args,state,this.metadata('MINIFS'),(v,...p)=>{const h=condAgg(p); if(h instanceof CellError) return h; const a=grid(v); let m=null; for(const k of h){const x=raw(at(a,k)); if(typeof x==='number'&&(m===null||x<m)) m=x;} return m===null?0:m;})}
    maxifs(ast,state){return this.runFunction(ast.args,state,this.metadata('MAXIFS'),(v,...p)=>{const h=condAgg(p); if(h instanceof CellError) return h; const a=grid(v); let m=null; for(const k of h){const x=raw(at(a,k)); if(typeof x==='number'&&(m===null||x>m)) m=x;} return m===null?0:m;})}
    index(ast,state){return this.runFunction(ast.args,state,this.metadata('INDEX'),(rng,r,c)=>{
      if(rng instanceof CellError) return rng; if(!isRange(rng)){ return rng; }
      const h=rng.height(), w=rng.width(); r=r===undefined?1:num(r); 
      if(c===undefined){ if(h===1&&w>1){ c=r; r=1; } else c=1; } else c=num(c);
      if(r===null||c===null) return new CellError(ErrorType.VALUE);
      if(r<1||c<1||r>h||c>w) return new CellError(ErrorType.REF);
      // Einzelzelle direkt lesen, ohne den ganzen Bereich zu laden (spart viel Rechenzeit)
      if(rng._data===undefined&&rng.range&&rng.dependencyGraph){ try{ const a=rng.range.start; const x=rng.dependencyGraph.getCellValue({sheet:a.sheet,row:a.row+r-1,col:a.col+c-1}); return x===undefined?'':x; }catch(e){ /* Zelle noch nicht berechnet → regulär über den Bereich */ } }
      const d=rng.data; const x=d[r-1][c-1]; return x===undefined?'':x;})}
    text(ast,state){return this.runFunction(ast.args,state,this.metadata('TEXT'),(v,f)=>{
      if(v instanceof CellError) return v; v=raw(v); f=String(raw(f)??'');
      if(typeof v!=='number'){ return v==null?'':String(v); }
      if(f==='0%') return Math.round(v*100)+'%';
      if(/^0+$/.test(f)) return String(Math.round(v)).padStart(f.length,'0');
      if(/^0\.0+$/.test(f)){ const d=f.length-2; return v.toFixed(d); }
      if(/^#,##0$/.test(f)) return Math.round(v).toLocaleString(FIXED_LOCALE);
      const dm=f.match(/^(DD|D)\.(MM|M)\.(YYYY|YY)$/i); if(dm){ const dt=new Date(Date.UTC(1899,11,30)+Math.round(v)*864e5); const dd=dt.getUTCDate(), mm=dt.getUTCMonth()+1, yy=dt.getUTCFullYear();
        return (dm[1].length===2?String(dd).padStart(2,'0'):dd)+'.'+(dm[2].length===2?String(mm).padStart(2,'0'):mm)+'.'+(dm[3].length===4?yy:String(yy).slice(2)); }
      return f; })}
    today(ast,state){return this.runFunction(ast.args,state,this.metadata('TODAY'),()=>TODAY_SERIAL!==null?TODAY_SERIAL:serialOf(new Date()))}
  }
  function wild(v){ // LibreOffice-Platzhalter * ? ~
    let r=''; for(let i=0;i<v.length;i++){const ch=v[i];
      if(ch==='~'&&i+1<v.length){r+=v[++i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
      else if(ch==='*') r+='[\\s\\S]*'; else if(ch==='?') r+='[\\s\\S]'; else r+=ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
    return new RegExp('^'+r+'$','i');}
  const approx=v=>v===null?0:Number(v.toPrecision(15));
  const isEmpty=x=>x===null||x===undefined||x==='';
  function crit(c){
    c=raw(c);
    if(c instanceof CellError) return ()=>false;
    if(typeof c==='number') return x=>{x=raw(x);return typeof x==='number'&&Math.abs(x-c)<1e-12;};
    if(typeof c==='boolean') return x=>raw(x)===c;
    c=c==null?'':String(c);
    const m=c.match(/^(<=|>=|<>|<|>|=)?([\s\S]*)$/); const op=m[1]||'='; const v=m[2];
    const t=v.trim(); const nv=(t!==''&&/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?%?$/.test(t))?(t.endsWith('%')?Number(t.slice(0,-1))/100:Number(t)):null;
    const bv=/^(true|false)$/i.test(t)?t.toLowerCase()==='true':null;
    if(nv!==null){
      return x=>{x=raw(x); if(typeof x==='boolean') x=x?1:0;
        if(typeof x!=='number') return op==='<>';
        switch(op){case'=':return Math.abs(x-nv)<1e-12;case'<>':return Math.abs(x-nv)>=1e-12;case'<':return x<nv;case'>':return x>nv;case'<=':return x<=nv;case'>=':return x>=nv}};
    }
    if(bv!==null&&(op==='='||op==='<>')) return x=>{x=raw(x); const eq=x===bv; return op==='='?eq:!eq;};
    if(v===''){ if(op==='=') return x=>isEmpty(raw(x)); if(op==='<>') return x=>!isEmpty(raw(x)); return ()=>false; }
    const hasW=/[*?~]/.test(v); const re=hasW?wild(v):null; const lv=v.toLowerCase();
    return x=>{x=raw(x);
      if(op==='='||op==='<>'){ let eq=false; if(typeof x==='string') eq=re?re.test(x):x.toLowerCase()===lv; return op==='='?eq:!eq; }
      if(typeof x!=='string'||x==='') return false; const xs=x.toLowerCase();
      switch(op){case'<':return xs<lv;case'>':return xs>lv;case'<=':return xs<=lv;case'>=':return xs>=lv} return false;};
  }
  // Ohne Kopien: direkt auf die 2D-Daten der Bereiche zugreifen (spart GC-Zeit)
  function grid(v){ if(isRange(v)){ const d=v.data; return {d,w:d.length?d[0].length:0,n:d.length*(d.length?d[0].length:0)}; } return {d:[[v]],w:1,n:1}; }
  const at=(g,k)=>{ const x=g.d[(k/g.w)|0][k%g.w]; return typeof x==='symbol'?null:x; };
  function condAgg(pairs){ const cs=[]; for(let i=0;i<pairs.length;i+=2){ if(pairs[i] instanceof CellError) return pairs[i]; cs.push([grid(pairs[i]),crit(pairs[i+1])]); }
    const n=cs.length?cs[0][0].n:0; for(const [g] of cs) if(g.n!==n) return new CellError(ErrorType.VALUE);
    const hit=[]; outer: for(let k=0;k<n;k++){ for(let j=0;j<cs.length;j++){ if(!cs[j][1](at(cs[j][0],k))) continue outer; } hit.push(k); } return hit; }
  const sumAt=(g,hit)=>{let s=0; for(const k of hit){const x=raw(at(g,k)); if(x instanceof CellError) return x; if(typeof x==='number') s+=x;} return s;};
  GPlugin.implementedFunctions={
    N:{method:'n',parameters:[{argumentType:A.ANY}]},
    TEXTJOIN:{method:'textjoin',parameters:[{argumentType:A.ANY},{argumentType:A.ANY},{argumentType:A.ANY}],repeatLastArgs:1},
    LOOKUP:{method:'lookup',parameters:[{argumentType:A.ANY},{argumentType:A.RANGE},{argumentType:A.RANGE,optionalArg:true}]},
    RANK:{method:'rank',parameters:[{argumentType:A.ANY},{argumentType:A.RANGE},{argumentType:A.ANY,optionalArg:true}]},
    FIXED:{method:'fixed',parameters:[{argumentType:A.ANY},{argumentType:A.ANY,optionalArg:true},{argumentType:A.ANY,optionalArg:true}]},
    AVERAGEIFS:{method:'averageifs',parameters:[{argumentType:A.RANGE},{argumentType:A.RANGE},{argumentType:A.ANY}],repeatLastArgs:2},
    TODAY:{method:'today',parameters:[],isVolatile:true},
    MATCH:{method:'match',parameters:[{argumentType:A.ANY},{argumentType:A.RANGE},{argumentType:A.ANY,optionalArg:true}]},
    ROUNDUP:{method:'roundup',parameters:[{argumentType:A.ANY},{argumentType:A.ANY,optionalArg:true}]},
    ROUNDDOWN:{method:'rounddown',parameters:[{argumentType:A.ANY},{argumentType:A.ANY,optionalArg:true}]},
    IRR:{method:'irr',parameters:[{argumentType:A.RANGE},{argumentType:A.ANY,optionalArg:true}]},
    ROW:{method:'rowArr',arraySizeMethod:'rowArrSize',parameters:[{argumentType:A.NOERROR,optionalArg:true}],isDependentOnSheetStructureChange:true,doesNotNeedArgumentsToBeComputed:true,vectorizationForbidden:true},
    MINIFS:{method:'minifs',parameters:[{argumentType:A.RANGE},{argumentType:A.RANGE},{argumentType:A.ANY}],repeatLastArgs:2},
    MAXIFS:{method:'maxifs',parameters:[{argumentType:A.RANGE},{argumentType:A.RANGE},{argumentType:A.ANY}],repeatLastArgs:2},
    INDEX:{method:'index',parameters:[{argumentType:A.RANGE},{argumentType:A.ANY,optionalArg:true},{argumentType:A.ANY,optionalArg:true}]},
    TEXT:{method:'text',parameters:[{argumentType:A.ANY},{argumentType:A.ANY}]},
    VALUE:{method:'value',parameters:[{argumentType:A.ANY}]},
    COUNTIF:{method:'countif',parameters:[{argumentType:A.RANGE},{argumentType:A.ANY}]},
    COUNTIFS:{method:'countifs',parameters:[{argumentType:A.RANGE},{argumentType:A.ANY}],repeatLastArgs:2},
    SUMIF:{method:'sumif',parameters:[{argumentType:A.RANGE},{argumentType:A.ANY},{argumentType:A.RANGE,optionalArg:true}]},
    SUMIFS:{method:'sumifs',parameters:[{argumentType:A.RANGE},{argumentType:A.RANGE},{argumentType:A.ANY}],repeatLastArgs:2},
    AVERAGEIF:{method:'averageif',parameters:[{argumentType:A.RANGE},{argumentType:A.ANY},{argumentType:A.RANGE,optionalArg:true}]},
  };
  const names={}; for(const k in GPlugin.implementedFunctions) names[k]=k;
  try{HyperFormula.unregisterFunction&&['TODAY','INDEX','TEXT','ROW','MINIFS','MAXIFS','MATCH','ROUNDUP','ROUNDDOWN','IRR','COUNTIF','COUNTIFS','SUMIF','SUMIFS','AVERAGEIF'].forEach(f=>{try{HyperFormula.unregisterFunction(f)}catch(e){}})}catch(e){}
  HyperFormula.registerFunctionPlugin(GPlugin,{enGB:names,enUS:names});
  const CONFIG={licenseKey:'gpl-v3',useArrayArithmetic:true,dateFormats:['DD.MM.YYYY'],timeFormats:[],parseDateTime:()=>undefined,nullDate:{year:1899,month:12,day:30},leapYear1900:false,smartRounding:true,precisionRounding:14};
  return {HyperFormula,CONFIG,setToday(s){TODAY_SERIAL=s},serialOf,setFixedLocale(l){FIXED_LOCALE=l}};
});
