/* ui-logic.js – reine Hilfsfunktionen der Oberfläche (ohne DOM), damit tests.js sie prüfen kann.
   Wird von index.html geladen (global UILogic) und von tests.js per require. */
(function(root,f){ if(typeof module==='object'&&module.exports) module.exports=f(); else root.UILogic=f(); })(typeof self!=='undefined'?self:this,function(){
  const isOpen=x=>x.st==='offen'||x.st==='läuft';
  const prioOf=x=>typeof x.prio==='number'?x.prio:9;
  /* Start: „Heute dran“ = höchstens n Aufgaben. Reihenfolge: fester Termin heute, dann Prio 1–2 überfällig/heute fällig, nach Prio und Datum. */
  function focusTasks(ts,T,n){ n=n||5; const open=ts.filter(isOpen);
    const heute=open.filter(x=>x.own===T);
    const dran=open.filter(x=>x.own!==T&&prioOf(x)<=2&&typeof x.due==='number'&&x.due<=T);
    const s=(a,b)=>prioOf(a)-prioOf(b)||(a.due||0)-(b.due||0)||a.nr-b.nr;
    return heute.sort(s).concat(dran.sort(s)).slice(0,n); }
  /* Aufräumen: alle überfälligen offenen Aufgaben, wichtigste und älteste zuerst */
  function triageList(ts,T,skip){ skip=skip||new Set();
    return ts.filter(x=>isOpen(x)&&typeof x.due==='number'&&x.due<T&&!skip.has(x.nr)).sort((a,b)=>prioOf(a)-prioOf(b)||a.due-b.due||a.nr-b.nr); }
  /* Datumsrechnung auf Tabellen-Seriennummern (Tage seit 30.12.1899) */
  const BASE=Date.UTC(1899,11,30);
  const toDate=n=>new Date(BASE+Math.round(n)*864e5);
  const fromYMD=(y,m,d)=>Math.round((Date.UTC(y,m,d)-BASE)/864e5);
  function addDays(n,d){ return n+d; }
  function addMonths(n,k){ const d=toDate(n); const y=d.getUTCFullYear(), m=d.getUTCMonth()+k, day=d.getUTCDate();
    const last=new Date(Date.UTC(y,m+1,0)).getUTCDate(); return fromYMD(y,m,Math.min(day,last)); }
  /* Statusanzeige oben in Klartext */
  function syncLabel(raw,pending,canSync){ raw=raw||''; const w=pending+' warten';
    if(!canSync) return pending?pending+' nur lokal':'nur lokal';
    if(raw==='synchron') return pending?w:'Alles gespeichert';
    if(raw==='geändert') return pending?w:'speichert …';
    if(raw.startsWith('gespeichert · sendet in')) return (pending?pending+' · ':'')+raw.replace('gespeichert · ','');
    if(raw==='sendet …') return 'Sendet …'; if(raw==='prüft …'||raw==='…') return 'Prüft …'; if(raw==='gleicht ab …') return 'Gleicht ab …';
    if(raw==='offline') return pending?'offline · '+w:'offline';
    if(raw==='Fehler') return 'Fehler – tippen';
    if(raw==='nur lesen') return 'nur lesen';
    if(raw.startsWith('lädt')) return 'Lädt '+raw.slice(4).trim();
    return raw||'–'; }
  function engineLabel(eng,elapsed,est){ if(eng==='bereit') return 'bereit'; if(eng==='rechnet …') return 'rechnet …';
    if(eng==='lädt'){ const s=Math.round(elapsed/1000); return est?'startet '+Math.min(99,Math.round(100*elapsed/est))+' %':'startet '+s+' s'; }
    return eng; }
  /* Aufgabenliste filtern und sortieren */
  function filterTasks(ts,f,T){ const q=String(f.q||'').toLowerCase().trim();
    const sets={offen:isOpen,prio1:x=>isOpen(x)&&x.prio===1,ueber:x=>isOpen(x)&&x.amp==='überfällig',eigen:x=>isOpen(x)&&/eigen/i.test(x.ausf||''),
      ohne:x=>isOpen(x)&&typeof x.due!=='number',erledigt:x=>x.st==='erledigt',alle:()=>true};
    let out=ts.filter(sets[f.a]||sets.offen);
    if(f.et) out=out.filter(x=>(x.etappe||'')===f.et); if(f.gw) out=out.filter(x=>(x.gew||'')===f.gw); if(f.au) out=out.filter(x=>(x.ausf||'')===f.au);
    if(q) out=out.filter(x=>String(x.nr)===q||[x.t,x.bem,x.eig,x.gew].join(' ').toLowerCase().includes(q));
    const due=x=>typeof x.due==='number'?x.due:1e9;
    const so={faellig:(a,b)=>due(a)-due(b)||prioOf(a)-prioOf(b)||a.nr-b.nr, prio:(a,b)=>prioOf(a)-prioOf(b)||due(a)-due(b)||a.nr-b.nr,
      nr:(a,b)=>a.nr-b.nr, nrab:(a,b)=>b.nr-a.nr, erl:(a,b)=>(b.erl||0)-(a.erl||0)||b.nr-a.nr};
    const key=f.s||(f.a==='erledigt'?'erl':'faellig'); return out.sort(so[key]||so.faellig); }
  /* Aufgabennummern in einem Text finden („Nr. 511“, „Nr. 505, 56, 504“, „Nr. 25/487“) */
  function taskRefs(text){ const out=[]; const s=String(text==null?'':text);
    for(const m of s.matchAll(/Nr\.\s*((?:\d{1,4}(?:\s*(?:,|\/|und|\+|–|-)\s*)?)+)/g)){ for(const n of m[1].match(/\d{1,4}/g)||[]){ const v=Number(n); if(!out.includes(v)) out.push(v); } }
    return out; }
  function numList(v){ if(v==null||v==='') return []; if(typeof v==='number') return [v]; return (String(v).match(/\d{1,4}/g)||[]).map(Number); }
  /* Einkaufsliste nach Bereich gruppieren */
  function groupBy(arr,key){ const m=new Map(); for(const x of arr){ const k=key(x)||'ohne Bereich'; if(!m.has(k)) m.set(k,[]); m.get(k).push(x); } return [...m.entries()]; }
  /* Zuletzt geöffnet: vorne einfügen, ohne Doppelte, höchstens n */
  function pushRecent(list,k,n){ return [k].concat((list||[]).filter(x=>x!==k)).slice(0,n||6); }
  return {isOpen,focusTasks,triageList,addDays,addMonths,syncLabel,engineLabel,filterTasks,taskRefs,numList,groupBy,pushRecent,fromYMD,toDate};
});
