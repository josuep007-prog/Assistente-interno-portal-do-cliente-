/* Control Onvio · ponte com o Control Hub (só no claude.ai, só depois de "Conectar ao Control Hub" nas Configurações).
 * O Control Hub é uma página aberta no claude.ai e só ela grava no banco do escritório. Este script é o carteiro:
 *  - escuta o aviso "ola" que a página do Hub manda a cada poucos segundos (guarda QUEM avisou);
 *  - entrega a ela o lote que o service worker pedir e devolve a confirmação;
 *  - não lê nem altera nada da página do claude.ai além dessas mensagens.
 * Protocolo (versão 1): Hub -> {ctlhub:1, de:'hub', tipo:'ola'} | Hub -> {ctlhub:1, de:'hub', tipo:'ack', id, ok, motivo}
 *                       aqui -> {ctlhub:1, de:'ext', tipo:'lote', id, token, ...lote}. */
(function () {
  'use strict';
  if (window.__controlOnvioPonteHub) return;
  window.__controlOnvioPonteHub = true;
  const FRESCO_MS = 35000;          // o Hub visível avisa a cada ~5 s
  // Um Hub em segundo plano (outra aba, enquanto a pessoa trabalha no Onvio) para de avisar, mas a página continua
  // recebendo mensagens: a janela dele fica lembrada enquanto a aba existir (até MEMORIA_MS desde o último aviso).
  const MEMORIA_MS = 6 * 3600 * 1000;
  let hub = null;                   // { win, em }
  const pendentes = {};             // id -> { responder, timer }

  const vivo = () => { try { return !!chrome.runtime.id; } catch (e) { return false; } };

  window.addEventListener('message', e => {
    const d = e.data;
    if (!d || d.ctlhub !== 1 || d.de !== 'hub') return;
    if (d.tipo === 'ola') {
      const novo = !hub || hub.win !== e.source || Date.now() - hub.em > MEMORIA_MS;
      hub = { win: e.source, em: Date.now() };
      // O Hub acabou de aparecer (aba aberta ou recarregada): o service worker manda o resumo na hora, se faltar
      if (novo && vivo()) { try { chrome.runtime.sendMessage({ cmd: 'hubAbriu' }).catch(() => {}); } catch (x) { /* extensão atualizada */ } }
      return;
    }
    if (d.tipo === 'ack' && d.id && pendentes[d.id] && e.source === (hub && hub.win)) {
      const p = pendentes[d.id]; clearTimeout(p.timer); delete pendentes[d.id];
      p.responder({ ok: !!d.ok, motivo: d.motivo || '', aceitos: d.aceitos, mensagem: d.mensagem || '' });
    }
  });

  // Ao ligar (ou entrar numa página do claude.ai já aberta), pede que o Hub se anuncie já, sem esperar o próximo aviso.
  const pedirAviso = () => { try { document.querySelectorAll('iframe').forEach(f => { try { f.contentWindow.postMessage({ ctlhub: 1, de: 'ponte', tipo: 'busca' }, '*'); } catch (e) { /* quadro fechado */ } }); } catch (e) { /* sem DOM ainda */ } };
  pedirAviso();
  document.addEventListener('DOMContentLoaded', pedirAviso);
  window.addEventListener('load', () => { pedirAviso(); setTimeout(pedirAviso, 1500); });
  const aberta = () => { try { return !!hub && !hub.win.closed; } catch (x) { return false; } };
  const temHub = () => aberta() && Date.now() - hub.em < MEMORIA_MS;
  const avisandoAgora = () => aberta() && Date.now() - hub.em < FRESCO_MS;
  // Espera um pouco por um aviso do Hub (o primeiro pode demorar alguns segundos depois de ligar a ponte). Com ms = 0 só usa o que já sabe.
  const esperarHub = async ms => { if (temHub()) return true; if (!(ms > 0)) return false; const fim = Date.now() + ms; pedirAviso(); while (!temHub() && Date.now() < fim) await new Promise(r => setTimeout(r, 250)); return temHub(); };

  if (!vivo()) return;
  chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
    if (!msg || msg.alvo !== 'ponte-hub') return;
    if (msg.cmd === 'status') { esperarHub(2500).then(() => responder({ hub: temHub(), avisando: avisandoAgora() })); return true; }
    if (msg.cmd === 'enviar') {
      const lote = msg.lote || {};
      const id = String(lote.id || '');
      if (!id) { responder({ ok: false, motivo: 'sem-id' }); return; }
      esperarHub(msg.espera == null ? 5000 : Number(msg.espera)).then(achou => {
        if (!achou) { responder({ ok: false, motivo: 'sem-hub' }); return; }
        pendentes[id] = { responder, timer: setTimeout(() => { delete pendentes[id]; responder({ ok: false, motivo: 'sem-resposta' }); }, 10000) };
        hub.win.postMessage(Object.assign({ ctlhub: 1, de: 'ext', tipo: 'lote' }, lote), '*');
      });
      return true;                  // resposta assíncrona
    }
  });
})();
