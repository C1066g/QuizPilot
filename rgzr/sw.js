const CACHE = 'quizpilot-v2';
const ASSETS = [
  '/', '/index.html', '/app.js', '/browse.html', '/browse.js',
  '/wrong.html', '/wrong.js',
  '/questions-part1.js', '/questions-part2.js', '/questions-part3.js', '/questions-part4.js',
  '/questions-exchange.js', '/questions-linux.js', '/questions-speech.js', '/questions-dip.js',
  '/lib/mammoth.browser.min.js', '/lib/pdf.min.js', '/lib/pdf.worker.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response('离线模式，请联网后重试'))
    )
  );
});
