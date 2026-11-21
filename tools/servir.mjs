// Servidor local para testar o app. Uso: node tools/servir.mjs [porta]
//   http://localhost:5173/         app normal (precisa do firebase-config.js preenchido)
//   http://localhost:5173/__mock   app com um Firebase de mentira em memória, para ver as telas
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const porta = Number(process.argv[2]) || 5173;
const tipos = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".pdf": "application/pdf", ".webmanifest": "application/manifest+json", ".json": "application/json"
};

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let rel = decodeURIComponent(url.pathname);
  if (req.method === "POST" && rel === "/__salvar") {
    // Só para testes: guarda um arquivo gerado pelo app (ex.: o PDF) em tools/_saida/
    const pasta = path.join(raiz, "tools", "_saida");
    fs.mkdirSync(pasta, { recursive: true });
    const nome = path.basename(url.searchParams.get("nome") || "saida.bin");
    const partes = [];
    req.on("data", c => partes.push(c));
    req.on("end", () => { fs.writeFileSync(path.join(pasta, nome), Buffer.concat(partes)); res.writeHead(200); res.end("ok"); });
    return;
  }
  if (rel === "/__mock") {
    let html = fs.readFileSync(path.join(raiz, "index.html"), "utf8");
    html = html.replace("<head>", '<head><base href="/"><script type="importmap">{"imports":{"/js/fb.js":"/tools/fb-mock.js"}}</script>');
    res.writeHead(200, { "Content-Type": tipos[".html"] });
    return res.end(html);
  }
  if (rel.endsWith("/")) rel += "index.html";
  const arq = path.join(raiz, rel);
  if (!arq.startsWith(raiz) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) {
    res.writeHead(404); return res.end("não encontrado");
  }
  res.writeHead(200, { "Content-Type": tipos[path.extname(arq)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(arq).pipe(res);
}).listen(porta, () => console.log("http://localhost:" + porta));
