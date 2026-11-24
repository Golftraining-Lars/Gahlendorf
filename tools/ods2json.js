// ODS → workbook.json (Eingaben + Formeln + letzte Werte + Formate + Listen)
// Aufruf: node ods2json.js <datei.xlsx> <extras.json> <out.json> [version]
const XLSX=require(process.env.XLSX_MOD||'xlsx'); const fs=require('fs');
const [,,xl,exf,out,ver]=process.argv;
const wb=XLSX.readFile(xl,{cellFormula:true,cellNF:true});
const ex=JSON.parse(fs.readFileSync(exf,'utf8'));
const fmts=[], fmtIdx={}; const fid=z=>{if(!z||z==='General')return undefined; if(!(z in fmtIdx)){fmtIdx[z]=fmts.length;fmts.push(z)} return fmtIdx[z]};
const sheets=[];
for(const name of wb.SheetNames){
  const ws=wb.Sheets[name]; const e=ex.sheets[name]||{cols:[],hiddenCols:[],hiddenRows:[],val:{},sty:{}};
  let R=-1,C=-1; const cells={};
  for(const k in ws){ if(k[0]==='!') continue; const a=XLSX.utils.decode_cell(k); const c=ws[k];
    const has=c.f||(c.v!==undefined&&c.v!==null&&c.v!=='');
    if(!has) continue; if(a.c>=80||a.r>=3000) continue; cells[k]=[a,c]; R=Math.max(R,a.r); C=Math.max(C,a.c); }
  const inp=[],val=[]; for(let r=0;r<=R;r++){inp.push(new Array(C+1).fill(null));val.push(new Array(C+1).fill(null));}
  const fmt={};
  for(const k in cells){const [a,c]=cells[k];
    let v=c.v===undefined?null:c.v; if(v instanceof Date) v=null;
    if(c.f){ inp[a.r][a.c]='='+c.f; val[a.r][a.c]=(c.t==='e')?{e:c.w||'#ERR'}:v; }
    else { inp[a.r][a.c]=(typeof v==='string'&&(v.startsWith('=')||v.startsWith("'")))?"'"+v:v; }
    const f=fid(c.z); if(f!==undefined) fmt[a.r+','+a.c]=f; }
  // trailing empty trim of rows only with null
  const merges=(ws['!merges']||[]).filter(m=>m.s.r<=R&&m.s.c<=C).map(m=>[m.s.r,m.s.c,m.e.r,m.e.c]);
  const val2={}; for(const k in e.val){const [r,c]=k.split(',').map(Number); if(r<=Math.max(R,0)+200&&c<=C+5) val2[k]=e.val[k];}
  const sty={}; for(const k in e.sty){const [r,c]=k.split(',').map(Number); if(r<=R&&c<=C) sty[k]=e.sty[k];}
  sheets.push({name,hidden:!!e.hidden,cols:(e.cols||[]).slice(0,C+1),hiddenCols:e.hiddenCols||[],hiddenRows:(e.hiddenRows||[]).filter(r=>r<=R),merges,inp,val,fmt,dv:val2,sty});
}
const wbj={schema:1,version:ver||'',exported:new Date().toISOString(),source:'Fehmarn.ods',fmts,styles:ex.styles,validations:ex.validations,sheets};
fs.writeFileSync(out,JSON.stringify(wbj));
console.log('sheets',sheets.length,'bytes',fs.statSync(out).size,'fmts',fmts.length);
