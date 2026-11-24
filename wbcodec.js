/* Kompaktes Speicherformat der Arbeitsmappe.
   Formeln werden relativ kodiert (wie R1C1) und als Vorlagen + Läufe je Spalte
   abgelegt: 1.000 gleich aufgebaute Formeln einer Spalte kosten so nur einen
   Eintrag. decode() liefert wieder dichte 2D-Felder (inp/val). */
(function(root,f){ if(typeof module==='object'&&module.exports) module.exports=f(); else root.WBCodec=f(); })(typeof self!=='undefined'?self:this,function(){
  const colNum=s=>{let c=0;for(const ch of s)c=c*26+ch.charCodeAt(0)-64;return c-1};
  const colStr=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s};
  // Zerlegt Formel in Strings/Sheetnamen (unberührt) und Code-Abschnitte
  function mapCode(f,fn){let out='',i=0;while(i<f.length){const ch=f[i];
    if(ch==='"'){let j=i+1;while(j<f.length){if(f[j]==='"'){if(f[j+1]==='"'){j+=2;continue}break}j++}out+=f.slice(i,j+1);i=j+1;continue}
    if(ch==="'"){let j=i+1;while(j<f.length){if(f[j]==="'"){if(f[j+1]==="'"){j+=2;continue}break}j++}out+=f.slice(i,j+1);i=j+1;continue}
    let j=i;while(j<f.length&&f[j]!=='"'&&f[j]!=="'")j++;out+=fn(f.slice(i,j));i=j}return out}
  const REF=/(^|[^A-Za-z0-9_.§])(\$?)([A-Z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_(§])/g;
  function enc(f,r,c){return mapCode(f,s=>s.replace(REF,(m,p,ca,cs,ra,rs)=>{const cc=colNum(cs),rr=Number(rs)-1;
    return p+'§'+(ca?'$'+cc:(cc-c))+'|'+(ra?'$'+rr:(rr-r))+'§'}))}
  function dec(t,r,c){return t.replace(/§(\$?-?\d+)\|(\$?-?\d+)§/g,(m,a,b)=>{
    const cc=a[0]==='$'?Number(a.slice(1)):c+Number(a), rr=b[0]==='$'?Number(b.slice(1)):r+Number(b);
    return (a[0]==='$'?'$':'')+colStr(cc)+(b[0]==='$'?'$':'')+(rr+1)})}
  function runs(get,R,C){const out=[];for(let c=0;c<C;c++){let cur=null;for(let r=0;r<=R;r++){const v=get(r,c);
    if(v!==undefined&&v!==null&&cur&&cur[3]===v&&cur[2]===r-1){cur[2]=r;continue}
    if(cur){out.push(cur);cur=null} if(v!==undefined&&v!==null) cur=[c,r,r,v]}if(cur)out.push(cur)}return out}
  function trimRow(a){let n=a.length;while(n>0&&(a[n-1]===null||a[n-1]===undefined))n--;return a.slice(0,n)}
  function encodeSheet(s,T,Ti){ // s: {inp,val,fmt:{},dv:{},sty:{}...}
    const R=s.inp.length-1, C=Math.max(0,...s.inp.map(r=>r.length));
    const tmpl=(r,c)=>{const v=s.inp[r]&&s.inp[r][c]; if(typeof v!=='string'||v[0]!=='=') return null; const t=enc(v.slice(1),r,c);
      if(!(t in Ti)){Ti[t]=T.length;T.push(t)} return Ti[t]};
    const frm=runs(tmpl,R,C);
    const k=s.inp.map(row=>trimRow(row.map(v=>typeof v==='string'&&v[0]==='='?null:v)));
    const v=s.val.map((row,r)=>trimRow(row.map((x,c)=>{const i=s.inp[r][c]; return typeof i==='string'&&i[0]==='='?x:null})));
    const sp=(m)=>{const g=(r,c)=>m[r+','+c]; let RR=0,CC=0; for(const key in m){const [a,b]=key.split(',').map(Number);RR=Math.max(RR,a);CC=Math.max(CC,b+1)} return runs(g,RR,CC)};
    const o={name:s.name,hidden:s.hidden,cols:s.cols,hiddenCols:s.hiddenCols,hiddenRows:s.hiddenRows,merges:s.merges,k,frm,v,fmt:sp(s.fmt||{}),dv:sp(s.dv||{}),sty:sp(s.sty||{})};
    return o}
  function encode(wb){const T=[],Ti={}; const sheets=wb.sheets.map(s=>encodeSheet(s,T,Ti)); const o=Object.assign({},wb,{schema:2,tmpl:T,sheets}); return o}
  function decodeSheet(s,T){const R=Math.max(s.k.length, s.v.length, ...s.frm.map(x=>x[2]+1))-1;
    let C=0; for(const r of s.k) C=Math.max(C,r.length); for(const r of s.v) C=Math.max(C,r.length); for(const f of s.frm) C=Math.max(C,f[0]+1);
    const inp=[],val=[]; for(let r=0;r<=R;r++){inp.push(new Array(C).fill(null));val.push(new Array(C).fill(null))}
    s.k.forEach((row,r)=>row.forEach((x,c)=>{if(x!==null&&x!==undefined) inp[r][c]=x}));
    s.v.forEach((row,r)=>row.forEach((x,c)=>{if(x!==undefined) val[r][c]=x}));
    for(const [c,r0,r1,t] of s.frm) for(let r=r0;r<=r1;r++) inp[r][c]='='+dec(T[t],r,c);
    const unrun=(rs)=>{const m={}; for(const [c,r0,r1,x] of rs) for(let r=r0;r<=r1;r++) m[r+','+c]=x; return m};
    return {name:s.name,hidden:s.hidden,cols:s.cols,hiddenCols:s.hiddenCols,hiddenRows:s.hiddenRows,merges:s.merges,inp,val,fmt:unrun(s.fmt),dv:unrun(s.dv),sty:unrun(s.sty)}}
  function decode(o){if(o.schema!==2) return o; const sheets=o.sheets.map(s=>decodeSheet(s,o.tmpl)); const w=Object.assign({},o,{schema:1,sheets}); delete w.tmpl; return w}
  return {encode,decode,enc,dec,colStr,colNum};
});
