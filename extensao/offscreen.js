/* Leitor de PDF fora da tela (0.68.0): recebe o Extrato Mensal em base64 do service worker e devolve só o TEXTO, linha a linha.
 * pdf.js empacotado em lib/pdfjs (4.10.38), sem rede e sem eval. Nada é guardado aqui: o documento fecha ao fim do envio. */
import * as pdfjs from './lib/pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdfjs/pdf.worker.min.mjs');
const PAGINAS_MAX = 80;

// Junta os pedaços de texto da página em linhas, pela altura (y) e da esquerda para a direita; espaço grande vira dois espaços.
export function linhasDaPagina(itens) {
  const pedacos = itens.filter(i => i && typeof i.str === 'string' && i.transform).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || 8 }));
  pedacos.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const linhas = [];
  for (const p of pedacos) {
    const l = linhas[linhas.length - 1];
    if (l && Math.abs(l.y - p.y) <= Math.max(2, p.h * 0.35)) l.p.push(p); else linhas.push({ y: p.y, p: [p] });
  }
  return linhas.map(l => {
    l.p.sort((a, b) => a.x - b.x);
    let t = '', fim = null;
    for (const p of l.p) {
      if (!p.s) continue;
      if (fim != null) { const gap = p.x - fim; t += gap > p.h * 1.2 ? '  ' : gap > p.h * 0.15 ? ' ' : ''; }
      t += p.s; fim = p.x + p.w;
    }
    return t.replace(/\s+$/, '');
  }).filter(Boolean);
}
async function textoDe(b64) {
  const bin = atob(b64), data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false }).promise;
  try {
    const out = [];
    for (let n = 1; n <= Math.min(doc.numPages, PAGINAS_MAX); n++) {
      const pg = await doc.getPage(n), tc = await pg.getTextContent();
      out.push(...linhasDaPagina(tc.items)); pg.cleanup();
    }
    return out.join('\n');
  } finally { doc.destroy(); }
}
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) chrome.runtime.onMessage.addListener((m, _s, responder) => {
  if (!m || m.alvo !== 'offscreen' || m.cmd !== 'pdfTexto') return false;
  textoDe(String(m.b64 || '')).then(texto => responder({ ok: true, texto }), e => responder({ ok: false, erro: String((e && e.message) || e).slice(0, 120) }));
  return true;
});
