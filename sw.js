/* Service worker du Scanner.
   - Moteur de scan (opencv.js, 11 Mo) et jsPDF : cache d'abord -> lancement
     instantané et fonctionnement hors ligne, sans retélécharger 11 Mo.
   - Page (index.html) : réseau d'abord -> les mises à jour arrivent dès
     qu'on est en ligne ; copie en cache si hors ligne.
   Changer opencv.js ou jspdf => incrémenter CACHE pour forcer le rafraîchissement. */
const CACHE = 'scanner-v1';
const PRECACHE = ['./', './opencv.js', './jspdf.umd.min.js'];

self.addEventListener('install', (e) => {
  // n'ajoute que ce qui manque : une mise à jour de sw.js ne retélécharge pas les 11 Mo
  e.waitUntil(
    caches.open(CACHE)
      .then(async (c) => {
        for (const url of PRECACHE) {
          if (!(await c.match(url))) await c.add(url);
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate' || /\/$|\.html$/.test(new URL(req.url).pathname);
  if (isPage) {
    // réseau d'abord, mais pas plus de 3 s : avec un réseau faible on affiche
    // la copie locale au lieu d'un écran blanc (la copie se met à jour en fond)
    const network = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    });
    const cached = () => caches.match(req).then((r) => r || caches.match('./'));
    e.respondWith(
      Promise.race([
        network.catch(() => null),
        new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
      ]).then(async (res) => res || (await cached()) || network)
    );
    e.waitUntil(network.catch(() => {}));
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
