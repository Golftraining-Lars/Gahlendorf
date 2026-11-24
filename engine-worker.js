/* Rechenkern im Hintergrund: hält die Arbeitsmappe in HyperFormula, führt Ops aus
   und meldet geänderte Zellen an die Oberfläche. */
importScripts('vendor/hyperformula.full.min.js','engine.js','wbcodec.js','core.js');
GEngine.setFixedLocale('de-DE');
let book=null, ready=false;
function changesOf(list){ const out=[]; if(!list) return out;
  for(const ch of list){ if(!ch||!ch.address) continue; const a=ch.address; if(a.row===undefined) continue;
    const name=book.hf.getSheetName(a.sheet); let v=ch.newValue; if(v&&typeof v==='object'&&'type' in v) v={e:v.value}; out.push([name,a.row,a.col,v===undefined?null:v]); }
  return out; }
self.onmessage=async(e)=>{ const {id,cmd}=e.data; try{
  if(cmd==='init'){ ready=false; const t=Date.now(); book=new GCore.Book(e.data.texts?WBCodec.fromTexts(e.data.texts):e.data.wb); book.build(); hook(); ready=true;
    // Werte, die vom gespeicherten Stand abweichen (z. B. HEUTE()), sofort melden
    const diff=[]; for(const s of book.wb.sheets){ const id_=book.sid(s.name); const vals=book.hf.getSheetValues(id_);
      s.inp.forEach((row,r)=>row.forEach((x,c)=>{ if(typeof x==='string'&&x[0]==='='){ let v=vals[r]&&vals[r][c]; if(v&&typeof v==='object'&&'type' in v) v={e:v.value}; v=v===undefined?null:v; const o=s.val[r][c];
        if(JSON.stringify(o)!==JSON.stringify(v)) diff.push([s.name,r,c,v]); } })); }
    postMessage({id,ok:true,ms:Date.now()-t,changes:diff}); return; }
  if(!ready) throw new Error('Rechenkern noch nicht bereit');
  if(cmd==='op'){ let res; collected=[];
    res=book.apply(e.data.op);
    const op=e.data.op; const touched=new Set(['Aenderungsprotokoll']); if(op.sheet) touched.add(op.sheet);
    if(op.op==='task') touched.add('Renovierungsplan'); if(op.op==='ws') touched.add('Wissensspeicher');
    postMessage({id,ok:true,res,changes:collected,inputs:dump([...touched])}); collected=[]; return; }
  if(cmd==='snapshot'){ postMessage({id,ok:true,texts:WBCodec.splitTexts(book.split(e.data.meta||{}))}); return; }
  throw new Error('unbekannt: '+cmd);
 }catch(err){ postMessage({id,ok:false,error:String(err&&err.message||err)}); } };
// Kompletter Stand aller Blätter (Eingaben + Werte) – für die Oberfläche nach einer Op.
let collected=[];
function dump(names){ const out={}; for(const s of book.wb.sheets){ if(names&&!names.includes(s.name)) continue; const id_=book.sid(s.name);
  const inp=book.hf.getSheetSerialized(id_).map(r=>r.map(GCore.fromHF)); const vals=book.hf.getSheetValues(id_);
  out[s.name]={inp,val:vals.map(r=>r.map(v=>v&&typeof v==='object'&&'type' in v?{e:v.value}:(v===undefined?null:v)))}; } return out; }
function hook(){ book.hf.on('valuesUpdated',(ch)=>{ collected.push(...changesOf(ch)); }); }
