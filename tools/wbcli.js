#!/usr/bin/env node
/* Werkzeug für die Claude-Chats (und Notfälle): Arbeitsmappe ohne App bearbeiten.
   Nutzt DENSELBEN Kern wie die App (core.js) – gleiche Ops, gleiche Formeln.
   node tools/wbcli.js info    <workbook.json>
   node tools/wbcli.js read    <workbook.json> <Blatt> [vonZeile bisZeile]     (Zeilen 1-basiert)
   node tools/wbcli.js find    <workbook.json> <Blatt> <Text>
   node tools/wbcli.js apply   <workbook.json> <ops.json>                       (Ops-Liste, siehe README)
   node tools/wbcli.js script  <workbook.json> <skript.js>                      (module.exports = async (book,h) => {...})
   node tools/wbcli.js verify  <workbook.json>                                   (neu rechnen, mit gespeicherten Werten vergleichen)
   node tools/wbcli.js xlsx    <workbook.json> <ziel.xlsx>                       (Export für LibreOffice/Excel)
   node tools/wbcli.js serial  24.11.2026                                        (Datum → Zahl für Datumszellen)          */
const fs=require('fs'), path=require('path');
const G=require('../core.js'), C=require('../wbcodec.js');
const [,,cmd,file,...rest]=process.argv;
if(cmd==='serial'&&file){ const [d,m,y]=file.split('.').map(Number); console.log(Math.round((Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/864e5)); process.exit(0); }
if(!cmd||!file){ console.log(fs.readFileSync(__filename,'utf8').split('*/')[0]); process.exit(1); }
const load=()=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(book,meta)=>{ const e=book.encoded(Object.assign({exported:new Date().toISOString()},meta||{})); const tmp=file+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(e)); fs.renameSync(tmp,file); return e; };
const fmt=v=>v==null?'':(typeof v==='object'&&v.e?v.e:String(v));
(async()=>{
  if(cmd==='info'){ const w=C.decode(load()); console.log('Version',w.sheets.find(s=>s.name==='Übersicht').inp[2][1],'· exportiert',w.exported); for(const s of w.sheets) console.log((s.hidden?'  (ausgeblendet) ':'  ')+s.name+' · '+s.inp.length+' Zeilen'); return; }
  if(cmd==='read'||cmd==='find'){ const w=C.decode(load()); const s=w.sheets.find(x=>x.name===rest[0]); if(!s) throw new Error('Blatt fehlt');
    const show=(r)=>console.log((r+1)+'\t'+s.inp[r].map((x,c)=>typeof x==='string'&&x[0]==='='?'ƒ'+fmt(s.val[r][c]):fmt(x)).join('\t'));
    if(cmd==='read'){ const a=Number(rest[1]||1)-1, b=Number(rest[2]||s.inp.length)-1; for(let r=a;r<=b&&r<s.inp.length;r++) show(r); }
    else { const q=String(rest[1]).toLowerCase(); s.inp.forEach((row,r)=>{ if(row.some((x,c)=>String(typeof x==='string'&&x[0]==='='?fmt(s.val[r][c]):fmt(x)).toLowerCase().includes(q))) show(r); }); }
    return; }
  const t0=Date.now(); const book=new G.Book(load()).build(); console.error('Rechenkern bereit in',Date.now()-t0,'ms');
  if(cmd==='apply'){ const ops=JSON.parse(fs.readFileSync(rest[0],'utf8')); const res=[]; for(const op of ops){ op.who=op.who||'Renovierungsplan-Chat'; res.push(book.apply(op)); } save(book); console.log(JSON.stringify(res)); return; }
  if(cmd==='script'){ const fn=require(path.resolve(rest[0])); const out=await fn(book,{G,C}); save(book); if(out!==undefined) console.log(JSON.stringify(out)); return; }
  if(cmd==='verify'){ const w=book.wb; let tot=0,bad=0; for(const s of w.sheets){ const id=book.sid(s.name); const vals=book.hf.getSheetValues(id);
      s.inp.forEach((row,r)=>row.forEach((x,c)=>{ if(typeof x==='string'&&x[0]==='='){ tot++; let v=vals[r]&&vals[r][c]; if(v&&typeof v==='object'&&'type' in v) v={e:v.value}; const o=s.val[r][c];
        const same=JSON.stringify(o)===JSON.stringify(v??null)||(typeof o==='number'&&typeof v==='number'&&Math.abs(o-v)<1e-6*Math.max(1,Math.abs(o)));
        if(!same){ bad++; if(bad<=15) console.log('Abweichung',s.name,C.colStr(c)+(r+1),JSON.stringify(o),'→',JSON.stringify(v)); } } })); }
    console.log('Formeln',tot,'Abweichungen',bad,'(Datumsformeln mit HEUTE() weichen normal ab)'); return; }
  if(cmd==='xlsx'){ const XLSX=require('xlsx'); const snap=book.snapshot(); const wb=XLSX.utils.book_new();
    for(const s of snap.sheets){ const ws={}; let R=0,Cn=0; s.inp.forEach((row,r)=>row.forEach((x,c)=>{ if(x==null) return; R=Math.max(R,r); Cn=Math.max(Cn,c); const a=XLSX.utils.encode_cell({r,c}); const v=s.val[r][c];
        if(typeof x==='string'&&x[0]==='='){ const vv=v&&typeof v==='object'?null:v; ws[a]={f:x.slice(1),t:typeof vv==='number'?'n':typeof vv==='boolean'?'b':'s',v:vv==null?'':vv}; }
        else if(typeof x==='number') ws[a]={t:'n',v:x}; else if(typeof x==='boolean') ws[a]={t:'b',v:x}; else ws[a]={t:'s',v:x[0]==="'"?x.slice(1):x};
        const fi=s.fmt[r+','+c]; if(fi!=null&&ws[a].t==='n') ws[a].z=snap.fmts[fi]; }));
      ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:R,c:Cn}}); XLSX.utils.book_append_sheet(wb,ws,s.name.slice(0,31)); }
    XLSX.writeFile(wb,rest[0]); console.log('geschrieben',rest[0]); return; }
  throw new Error('unbekannter Befehl '+cmd);
})().catch(e=>{ console.error('FEHLER',e.message); process.exit(2); });
