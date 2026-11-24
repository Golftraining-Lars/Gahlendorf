/* tests.js – Commit-Gate: `node tests.js` muss mit Exitcode 0 enden.
   Ohne echte Daten (das App-Repo ist öffentlich!). Mit GAHLENDORF_DATA=/pfad/workbook.json
   läuft zusätzlich der Abgleich aller Formeln gegen die gespeicherten Werte. */
const fs=require('fs'); const E=require('./engine.js'), C=require('./wbcodec.js'), G=require('./core.js');
let pass=0, fail=0; const t=(name,fn)=>{ try{ fn(); pass++; }catch(e){ fail++; console.log('✗',name,'–',e.message); } };
const eq=(a,b,m)=>{ const A=JSON.stringify(a),B=JSON.stringify(b); if(A!==B) throw new Error((m||'')+' erwartet '+B+' bekommen '+A); };
const near=(a,b)=>{ if(Math.abs(a-b)>1e-9) throw new Error('erwartet '+b+' bekommen '+a); };
E.setToday(46350); E.setFixedLocale('en-US');
const calc=(rows)=>{ const hf=E.HyperFormula.buildFromSheets({S:rows.map(r=>r.map(G.toHF))},E.CONFIG); return (a)=>{ const [c,r]=[C.colNum(a.match(/[A-Z]+/)[0]),Number(a.match(/\d+/)[0])-1]; let v=hf.getCellValue({sheet:0,row:r,col:c}); return v&&typeof v==='object'&&'type' in v?'#'+v.type:v; }; };
/* ---------- Engine: LibreOffice-Verhalten ---------- */
t('N()',()=>{ const v=calc([[5,'x',true,'=N(A1)','=N(B1)','=N(C1)']]); eq([v('D1'),v('E1'),v('F1')],[5,0,1]); });
t('TEXTJOIN mit Bereich',()=>{ const v=calc([['a',''],['b','=TEXTJOIN(",",TRUE(),A1:A3)'],[null]]); eq(v('B2'),'a,b'); });
t('LOOKUP letzter Treffer',()=>{ const v=calc([[1,'x'],[2,'y'],[2,'z'],['=LOOKUP(2,A1:A3,B1:B3)']]); eq(v('A4'),'z'); });
t('RANK',()=>{ const v=calc([[3,1,2,'=RANK(A1,A1:C1,1)','=RANK(A1,A1:C1)']]); eq([v('D1'),v('E1')],[3,1]); });
t('VALUE',()=>{ const v=calc([['=VALUE("12")','=VALUE("0")','=VALUE("24.11.2026")']]); eq([v('A1'),v('B1'),v('C1')],[12,0,46350]); });
t('COUNTIF leeres Kriterium = leere Zellen',()=>{ const v=calc([['a',1],[null,2],['b',3],['=COUNTIF(A1:A3,"")','=SUMIFS(B1:B3,A1:A3,"<>")','=SUMIFS(B1:B3,A1:A3,A2&"")']]); eq([v('A4'),v('B4'),v('C4')],[1,4,2]); });
t('MATCH mit Platzhalter',()=>{ const v=calc([['Bezugsfertig (Einzug)'],['x'],['=MATCH("Bezugs*",A1:A2,0)']]); eq(v('A3'),1); });
t('INDEX einzeilig = Spaltenindex',()=>{ const v=calc([['a','b','c'],['=INDEX(A1:C1,3)']]); eq(v('A2'),'c'); });
t('INDEX leere Zelle = ""',()=>{ const v=calc([[null,'=IF(INDEX(A1:A1,1)="","leer","x")']]); eq(v('B1'),'leer'); });
t('ROW(Bereich) als Matrix',()=>{ const v=calc([['erledigt',5],['offen',7],['=SMALL(IF(A1:A2="offen",B1:B2+ROW(B1:B2)/100000),1)']]); near(v('A3'),7.00002); });
t('MINIFS/MAXIFS',()=>{ const v=calc([['a',5],['a',3],['b',1],['=MINIFS(B1:B3,A1:A3,"a")','=MAXIFS(B1:B3,A1:A3,"a")']]); eq([v('A4'),v('B4')],[3,5]); });
t('AVERAGEIFS',()=>{ const v=calc([[1,10],[2,20],[3,30],['=AVERAGEIFS(B1:B3,A1:A3,">=2")']]); eq(v('A4'),25); });
t('TEXT',()=>{ const v=calc([['=TEXT(0.79,"0%")','=TEXT(7,"00")']]); eq([v('A1'),v('B1')],['79%','07']); });
t('ROUNDUP ohne Gleitkommafehler',()=>{ const v=calc([[122.72727272727272,0.1,'=ROUNDUP(A1*(1+B1),0)']]); eq(v('C1'),135); });
t('IRR',()=>{ const v=calc([[-100],[60],[60],['=IRR(A1:A3)']]); near(Math.round(v('A4')*1e6)/1e6,0.130662); });
t('FIXED',()=>{ const v=calc([['=FIXED(3720.4,0)']]); eq(v('A1'),'3,720'); });
t('HEUTE() einstellbar',()=>{ const v=calc([['=TODAY()']]); eq(v('A1'),46350); });
t('Text bleibt Text (kein Datum)',()=>{ const v=calc([['17.10.','=ISNUMBER(A1)']]); eq(v('B1'),false); });
/* ---------- Speicherformat ---------- */
const mini=()=>({schema:1,fmts:[],styles:{},validations:{},sheets:[
  {name:'Übersicht',hidden:false,cols:[],hiddenCols:[],hiddenRows:[],merges:[],fmt:{},dv:{},sty:{},inp:[['Datei'],[null],['Dateiversion','8.12','x']],val:[[null],[null],[null,null,null]]},
  {name:'Renovierungsplan',hidden:false,cols:[],hiddenCols:[],hiddenRows:[],merges:[],fmt:{},dv:{},sty:{},inp:[['Nr.','ToDo','Status','Prio'],[1,'A','offen',1,'=IF(C2="offen",1,0)'],[2,'B','=IFERROR(INDEX(Kostenplan!$C$2:$C$9,MATCH(A3,Kostenplan!$A$2:$A$9,0)),"offen")',2,'=IF(C3="offen",1,0)']],val:[[],[],[]]},
  {name:'Kostenplan',hidden:false,cols:[],hiddenCols:[],hiddenRows:[],merges:[],fmt:{},dv:{},sty:{},inp:[['Nr.','Maßnahme','Status'],[2,'B','läuft']],val:[[],[]]},
  {name:'Wissensspeicher',hidden:false,cols:[],hiddenCols:[],hiddenRows:[],merges:[],fmt:{},dv:{},sty:{},inp:[['ID','Datum','Nr.'],['W0001','01.01.2026',1]],val:[[],[]]},
  {name:'Aenderungsprotokoll',hidden:false,cols:[],hiddenCols:[],hiddenRows:[],merges:[],fmt:{},dv:{},sty:{},inp:[['Text'],['alt']],val:[[],[]]},
  {name:'Legende',hidden:false,cols:[],hiddenCols:[],hiddenRows:[],merges:[],fmt:{},dv:{},sty:{},inp:[['Legende – Version 8.12']],val:[[]]},
  {name:'Stand der Dinge',hidden:false,cols:[],hiddenCols:[],hiddenRows:[],merges:[],fmt:{},dv:{},sty:{},inp:[['Stand 8.12']],val:[[]]},
  {name:'Arbeitsweise',hidden:false,cols:[],hiddenCols:[],hiddenRows:[],merges:[],fmt:{},dv:{},sty:{},inp:Array.from({length:12},()=>[null,null]),val:Array.from({length:12},()=>[null,null])}]});
t('Kodierung verlustfrei',()=>{ const w=mini(); const d=C.decode(JSON.parse(JSON.stringify(C.encode(w)))); w.sheets.forEach((s,i)=>s.inp.forEach((row,r)=>row.forEach((x,c)=>eq((d.sheets[i].inp[r]||[])[c]??null,x,s.name+r+','+c)))); });
t('relative Formeln wandern mit',()=>{ eq(C.dec(C.enc("SUM(A2:C2)+'Laufende Kosten'!$A$86+Renovierungsplan!B$3",1,3),5,3),"SUM(A6:C6)+'Laufende Kosten'!$A$86+Renovierungsplan!B$3"); });
t('Zeichenketten in Formeln bleiben unberührt',()=>{ eq(C.dec(C.enc('IF(A2="E1","A2",B2)',1,0),2,0),'IF(A3="E1","A2",B3)'); });
/* ---------- Kern-Operationen ---------- */
t('Status über Schlüssel setzen + Protokoll',()=>{ const b=new G.Book(mini()).build(); b.apply({op:'set',sheet:'Kostenplan',key:2,c:2,input:'erledigt',who:'Test'});
  eq(b.value('Renovierungsplan',2,2),'erledigt'); eq(String(b.input('Aenderungsprotokoll',2,0)).startsWith('[Test] Kostenplan C2 (Nr. 2)'),true); });
t('sets: mehrere Zellen, ein Protokolleintrag',()=>{ const b=new G.Book(mini()).build(); b.apply({op:'sets',sheet:'Renovierungsplan',key:1,cells:{2:'läuft',3:4}});
  eq([b.value('Renovierungsplan',1,2),b.value('Renovierungsplan',1,3),b.value('Renovierungsplan',1,4)],['läuft',4,0]); eq(b.lastRow('Aenderungsprotokoll',0),2); });
t('neue Aufgabe kopiert Formeln der letzten Zeile',()=>{ const b=new G.Book(mini()).build(); const r=b.apply({op:'task',fields:{B:'Neu',D:1}});
  eq([r.nr,r.r],[3,3]); eq(b.input('Renovierungsplan',3,4),'=IF(C4="offen",1,0)'); eq(b.value('Renovierungsplan',3,4),1); eq(b.value('Renovierungsplan',3,1),'Neu'); });
t('Wissenseintrag fortlaufend',()=>{ const b=new G.Book(mini()).build(); const r=b.apply({op:'ws',fields:{inhalt:'x',nr:2}}); eq(r.id,'W0002'); eq(b.value('Wissensspeicher',2,2),2); });
t('Version fortschreiben',()=>{ const b=new G.Book(mini()).build(); b.apply({op:'version',to:'8.13',date:'24.11.2026'});
  eq([b.value('Übersicht',2,1),b.value('Legende',0,0),b.value('Stand der Dinge',0,0),b.value('Arbeitsweise',11,1)],['8.13','Legende – Version 8.13','Stand 8.13','Version 8.13 am 24.11.2026 (Renovierungsplan-Chat)']); });
t('Schnappschuss → Kodierung → neu laden rechnet gleich',()=>{ const b=new G.Book(mini()).build(); b.apply({op:'task',fields:{B:'Neu'}}); const e=JSON.parse(JSON.stringify(b.encoded()));
  const b2=new G.Book(e).build(); eq(b2.value('Renovierungsplan',3,4),1); eq(b2.input('Renovierungsplan',3,1),'Neu'); });
t('Journal-Replay auf frischer Fassung (Konfliktfall)',()=>{ const base=mini(); const a=new G.Book(JSON.parse(JSON.stringify(base))).build(); const ops=[{op:'sets',sheet:'Renovierungsplan',key:1,cells:{3:9}}];
  const remote=new G.Book(JSON.parse(JSON.stringify(base))).build(); remote.apply({op:'task',fields:{B:'vom Chat'}}); const fresh=remote.encoded();
  const m=new G.Book(fresh).build(); ops.forEach(o=>m.apply(o)); eq([m.value('Renovierungsplan',1,3),m.value('Renovierungsplan',3,1)],[9,'vom Chat']); });
t('Eine Datei je Blatt: verlustfrei',()=>{ const w=mini(); const tx=C.splitTexts(C.encodeSplit(w)); eq(Object.keys(tx).length,w.sheets.length+1); const d=C.fromTexts(tx); w.sheets.forEach((s,i)=>s.inp.forEach((row,r)=>row.forEach((x,c)=>eq((d.sheets[i].inp[r]||[])[c]??null,x,s.name)))); });
t('Eine Datei je Blatt: Änderung berührt nur ein Blatt',()=>{ const b=new G.Book(mini()).build(); const t1=C.splitTexts(b.split({})); b.setRaw('Wissensspeicher',1,7,'x'); const t2=C.splitTexts(b.split({}));
  const diff=Object.keys(t1).filter(p=>t1[p]!==t2[p]); eq(diff,['sheets/wissensspeicher.json']); });
t('Foto-Operation',()=>{ const b=new G.Book(mini()).build(); b.apply({op:'foto',nr:2,path:'bilder/aufgaben/2-x.jpg',date:'24.11.2026'}); eq(b.wb.fotos[2].length,1); const m=b.split({}).meta; eq(m.fotos[2][0].path,'bilder/aufgaben/2-x.jpg'); });
t('Protokoll zeigt Datum als TT.MM.JJJJ',()=>{ const b=new G.Book(mini()).build(); b.apply({op:'sets',sheet:'Renovierungsplan',key:1,cells:{15:46350}}); if(!String(b.input('Aenderungsprotokoll',2,0)).includes('24.11.2026')) throw new Error(b.input('Aenderungsprotokoll',2,0)); });
t('Worker: nur erlaubte Pfade schreibbar',()=>{ const src=fs.readFileSync(__dirname+'/worker/worker.js','utf8'); for(const s of ['force: false','same(','X-Read-Key','stale base']) if(!src.includes(s)) throw new Error('fehlt: '+s); });
/* ---------- Doku-Pflicht: jede Operation steht im README ---------- */
t('alle Operationen dokumentiert',()=>{ const src=fs.readFileSync(__dirname+'/core.js','utf8'); const ops=[...src.matchAll(/case '(\w+)':/g)].map(m=>m[1]); const doc=fs.readFileSync(__dirname+'/README.md','utf8');
  for(const o of ops) if(!doc.includes('`'+o+'`')) throw new Error('Operation '+o+' fehlt im README'); });
t('App-Version überall gleich',()=>{ const v=require('./core.js').VERSION; const h=fs.readFileSync(__dirname+'/index.html','utf8'); const sw=fs.readFileSync(__dirname+'/sw.js','utf8');
  if(!h.includes("APP_VERSION='"+v+"'")) throw new Error('index.html'); if(!sw.includes('g10-app-'+v)) throw new Error('sw.js'); if(!fs.readFileSync(__dirname+'/README.md','utf8').includes('## '+v)) throw new Error('Changelog'); });
/* ---------- optional: echte Daten ---------- */
if(process.env.GAHLENDORF_DATA){ const P=process.env.GAHLENDORF_DATA; const path=require('path'); let d; if(fs.statSync(P).isDirectory()){ const meta=JSON.parse(fs.readFileSync(path.join(P,'meta.json'),'utf8')); const files={}; for(const o of meta.order) files[o.file]=JSON.parse(fs.readFileSync(path.join(P,o.file),'utf8')); d={meta,files}; } else d=JSON.parse(fs.readFileSync(P,'utf8')); const b=new G.Book(d).build(); let tot=0,bad=0;
  for(const s of b.wb.sheets){ const id=b.sid(s.name); const vals=b.hf.getSheetValues(id); s.inp.forEach((row,r)=>row.forEach((x,c)=>{ if(typeof x==='string'&&x[0]==='='){ tot++; let v=vals[r]&&vals[r][c]; if(v&&typeof v==='object'&&'type' in v) v={e:v.value};
    const o=s.val[r][c]; const ok=JSON.stringify(o)===JSON.stringify(v??null)||(typeof o==='number'&&typeof v==='number'&&Math.abs(o-v)<1e-6*Math.max(1,Math.abs(o)))||(o==null&&v==='')||(o===''&&v==null)||(o===0&&v==null); if(!ok) bad++; } })); }
  t('echte Daten: Formeln rechnen wie gespeichert (≥ 99,9 %)',()=>{ if(bad>tot*0.001) throw new Error(bad+' von '+tot+' abweichend'); }); console.log('Datenabgleich',tot-bad,'/',tot); }
console.log(`${pass} bestanden, ${fail} fehlgeschlagen`); process.exit(fail?1:0);
