const CACHE='lexipedia-shell-v14';
const FILES=['./','./index.html','./styles.css?v=13','./src/app.js?v=13','./src/language.js?v=13','./src/core.js?v=13','./src/articles.js','./src/pool.js?v=13','./src/wiki.js?v=13','./src/spelling.js?v=13','./src/semantic-worker.js?v=13','./manifest.webmanifest','./assets/icon.svg'];
self.addEventListener('install',evt=>{evt.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));self.skipWaiting();});
self.addEventListener('activate',evt=>{evt.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',evt=>{
  const url=new URL(evt.request.url);
  if(evt.request.method!=='GET'||url.origin!==location.origin)return;
  evt.respondWith(fetch(evt.request).then(response=>{
    if(response.ok){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(evt.request,clone));}
    return response;
  }).catch(()=>caches.match(evt.request)));
});
