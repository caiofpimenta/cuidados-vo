// Gera os ícones do app (PNG) sem dependências. Uso: node tools/gerar-icones.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const tabela = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = tabela[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloco(tipo, dados) {
  const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([len, corpo, crc]);
}

function png(tam, fundo, frente, braco, espessura) {
  const linha = tam * 3 + 1;
  const raw = Buffer.alloc(linha * tam);
  const c = tam / 2, meio = espessura / 2, ate = braco / 2;
  for (let y = 0; y < tam; y++) {
    raw[y * linha] = 0;
    for (let x = 0; x < tam; x++) {
      const dx = Math.abs(x + 0.5 - c), dy = Math.abs(y + 0.5 - c);
      const cruz = (dx <= meio && dy <= ate) || (dy <= meio && dx <= ate);
      const cor = cruz ? frente : fundo;
      const i = y * linha + 1 + x * 3;
      raw[i] = cor[0]; raw[i + 1] = cor[1]; raw[i + 2] = cor[2];
    }
  }
  const cab = Buffer.alloc(13);
  cab.writeUInt32BE(tam, 0); cab.writeUInt32BE(tam, 4);
  cab[8] = 8; cab[9] = 2; cab[10] = 0; cab[11] = 0; cab[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloco("IHDR", cab), bloco("IDAT", zlib.deflateSync(raw, { level: 9 })), bloco("IEND", Buffer.alloc(0))
  ]);
}

const FUNDO = [11, 110, 120], FRENTE = [255, 255, 255];
const pasta = path.join(__dirname, "..", "icons");
fs.mkdirSync(pasta, { recursive: true });
const saidas = [
  ["icon-192.png", 192, 0.52, 0.17],
  ["icon-512.png", 512, 0.52, 0.17],
  ["apple-touch-icon.png", 180, 0.52, 0.17],
  ["icon-maskable-512.png", 512, 0.40, 0.13]
];
for (const [nome, tam, braco, esp] of saidas) {
  fs.writeFileSync(path.join(pasta, nome), png(tam, FUNDO, FRENTE, tam * braco, tam * esp));
  console.log("ok", nome);
}
