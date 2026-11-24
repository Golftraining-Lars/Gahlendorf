/* Service Worker: App-Hülle offline. Daten liegen in IndexedDB (nicht hier). */
const CACHE='g10-app-1.0.1';
const FILES=['./','index.html','engine-worker.js','engine.js','wbcodec.js','core.js','vendor/hyperformula.full.min.js','vendor/xlsx.full.min.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{ const u=new URL(e.request.url); if(e.request.method!=='GET'||u.origin!==location.origin) return;
  // Netz zuerst (neue Version sofort), offline aus dem Cache
  e.respondWith(fetch(e.request).then(r=>{ const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return r; }).catch(()=>caches.match(e.request,{ignoreSearch:true}))); });
