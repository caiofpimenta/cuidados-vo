/* Service worker: abre o app sem internet e recebe as notificações de remédio. */
importScripts("firebase-config.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const VERSAO = "v1";
const CACHE = "cuidados-" + VERSAO;
const ARQUIVOS = [
  "./", "index.html", "style.css", "firebase-config.js", "manifest.webmanifest",
  "js/app.js", "js/fb.js", "js/util.js", "js/relatorio.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("cuidados-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // Arquivos do app: tenta a rede primeiro (para pegar atualizações) e cai no cache sem internet.
    e.respondWith(
      fetch(req).then(res => {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(req, copia));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match("index.html")))
    );
  } else if (["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com"].includes(url.hostname)) {
    // Bibliotecas e fontes: usa o cache e atualiza em segundo plano.
    e.respondWith(
      caches.match(req).then(r => {
        const rede = fetch(req).then(res => {
          if (res && (res.ok || res.type === "opaque")) caches.open(CACHE).then(c => c.put(req, res.clone()));
          return res;
        }).catch(() => r);
        return r || rede;
      })
    );
  }
});

if (self.FIREBASE_CONFIG && self.FIREBASE_CONFIG.apiKey && !/COLE/i.test(self.FIREBASE_CONFIG.apiKey)) {
  firebase.initializeApp(self.FIREBASE_CONFIG);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(payload => {
    const d = payload.data || {};
    return self.registration.showNotification(d.title || "Cuidados da Vó", {
      body: d.body || "",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: d.tag || "remedio",
      renotify: true,
      data: { url: d.url || "./" }
    });
  });
}

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(lista => {
      for (const c of lista) {
        if (c.url.startsWith(self.registration.scope) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(alvo);
    })
  );
});
