// Service worker Workspace (S18, PWA). Záměrně jen záloha: když se stránka /w
// nenačte (bez signálu), ukáže offline stránku. Nic dalšího se neukládá, takže
// v telefonu nezůstanou data zákazníků. Nová verze = změnit CACHE.
const CACHE = 'zakaziq-offline-v1'
const OFFLINE = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/ikony/ikona-192.png'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)))
})
