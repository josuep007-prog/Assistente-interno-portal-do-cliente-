/* Distribuição automática de responsáveis, na tela Distribuir. Quem roda é o service worker (cmd 'distribuicaoAuto'): a cada
 * N minutos, só neste Chrome e só em horário comercial, define o responsável das solicitações sem responsável pelos mesmos
 * critérios da tela. Para LIGAR é preciso a senha do gestor (trava leve, gestor.js); desligar e "Rodar agora" ficam livres
 * neste Chrome. Mostra o estado, as regras, a última rodada e as últimas atribuições (só identificação e responsável). */
import { estado, enviar, aoMudar } from '../estado.js';
import { esc, toast, ligarItens, simples, $ } from '../util.js';
import { gestorLiberado, senhaCerta } from './gestor.js';

let confirmarLigar = false, rodandoAgora = false;
let aberto = (() => { try { return localStorage.getItem('oc.daAberto') === '1'; } catch (e) { return false; } })();
let ultimoHost = null, ultimoCtx = null, ouvindo = false;

const hora = iso => { const x = new Date(iso); return isNaN(x) ? '' : x.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

export function montarDistAuto(host, ctx) {
  if (!host) return;
  ultimoHost = host; ultimoCtx = ctx;
  if (!ouvindo) {                                                    // as mudanças do service worker redesenham só este bloco
    ouvindo = true;
    aoMudar(quais => {
      if (!(quais.includes('distAuto') || quais.includes('distLog')) || !ultimoHost || !ultimoHost.isConnected) return;
      if (ultimoHost.contains(document.activeElement) && document.activeElement.matches('input')) return;   // não apaga a senha que está sendo digitada
      montarDistAuto(ultimoHost, ultimoCtx);
    });
  }
  const d = estado.distAuto || { ligada: false }, u = d.ultima, log = estado.distLog || [];
  const cfg = Object.assign({ minutos: 15, inicio: 8, fim: 18 }, estado.settings.distribuicaoAuto || {});
  const pul = u && u.puladas ? [['semHistorico', 'sem histórico da empresa (decisão manual)'], ['semId', 'sem o identificador do responsável'], ['naoPode', 'lista em que a extensão não define responsável'], ['outroSetor', 'Geral de outro departamento'], ['jaTemResponsavel', 'já tinham responsável']].filter(([k]) => u.puladas[k]).map(([k, t]) => u.puladas[k] + ' ' + t) : [];
  const botoes = d.ligada
    ? '<button class="btn btn-sm" id="da-agora"' + (rodandoAgora ? ' disabled' : '') + '>' + (rodandoAgora ? 'Rodando…' : 'Rodar agora') + '</button><button class="btn btn-sm" id="da-desligar">Desligar</button>'
    : confirmarLigar ? '' : '<button class="btn btn-sm btn-primary" id="da-ligar"><svg class="ic ic-sm"><use href="#i-lock"/></svg> Ligar</button>';
  host.innerHTML =
    '<section class="card da-card" id="d-auto"><div class="da-estado"><span class="da-pt ' + (d.ligada ? 'on' : '') + '"></span><div class="da-estado-tx"' + (simples() ? ' title="Define sozinha o responsável das solicitações sem responsável, em seu nome.' + (d.ligada ? '' : ' Para ligar, é preciso a senha do gestor.') + '"' : '') + '><b>Distribuição automática: <span id="da-estado">' + (d.ligada ? 'Ligada' : 'Desligada') + '</span></b>' +
      '<small' + (simples() ? ' class="da-linha"' : '') + '>' + (d.ligada && d.ligadaEm ? 'desde ' + esc(hora(d.ligadaEm)) + ' · ' : '') + (simples() ? (d.ligada ? 'a cada ' + cfg.minutos + ' min, em horário comercial' : 'para ligar, senha do gestor') : 'Define sozinha o responsável das solicitações sem responsável, em seu nome.' + (d.ligada ? '' : ' Para ligar, é preciso a senha do gestor.')) + '</small></div>' +
      '<div class="da-acoes">' + botoes + '<button class="btn btn-sm btn-ghost" id="da-detalhes" aria-expanded="' + aberto + '">' + (aberto ? 'Ocultar detalhes' : 'Ver detalhes') + '</button></div></div>' +
      (!d.ligada && confirmarLigar ? '<div class="acao-conf da-conf" id="da-conf"><b>Ligar a distribuição automática?</b><ul><li>A cada ' + cfg.minutos + ' minutos, em horário comercial, a extensão define no Onvio, <b>em seu nome</b>, o responsável das solicitações que estão <b>sem responsável</b>.</li><li>Critério igual ao desta tela: quem mais atendeu a empresa nos últimos 30 dias (Cadastros: quem mais fez admissões). Sem histórico, fica para decisão manual.</li><li>Nunca troca quem já é responsável e não escreve mais nada no Onvio. Para sozinha se o Onvio recusar.</li><li>Precisa de uma aba do Onvio aberta neste Chrome.</li></ul>' +
        (gestorLiberado() ? '' : '<label class="field da-senha">Senha do gestor<input type="password" id="da-senha" autocomplete="off" spellcheck="false"></label><p class="gt-erro" id="da-erro" role="alert" hidden>Senha incorreta. Tente de novo.</p>') +
        '<div class="acao-pe"><button class="btn btn-sm" id="da-cancelar">Cancelar</button><button class="btn btn-sm btn-primary" id="da-confirmar">Confirmar e ligar</button></div></div>' : '') +
      (aberto ? '<div class="da-regras">' +
        '<div><h4>Quando</h4><p>A cada ' + cfg.minutos + ' min, de seg a sex, das ' + cfg.inicio + 'h às ' + cfg.fim + 'h. Precisa de uma aba do Onvio aberta neste Chrome.</p></div>' +
        '<div><h4>Critério</h4><p>O mesmo desta tela: quem mais atendeu a empresa nos últimos 30 dias (Cadastros: quem mais fez admissões). Sem histórico, fica para decisão manual.</p></div>' +
        '<div><h4>Segurança</h4><p>Só em solicitações sem responsável; nunca troca quem já tem. Para sozinha se o Onvio recusar. Só o gestor liga, e só este Chrome distribui.</p></div></div>' : '') +
    '</section>' +
    (aberto ? '<div class="da-grade">' +
      '<section class="card"><div class="card-h"><h3>Última rodada</h3><span class="sub">' + (u ? esc(hora(u.em)) : 'ainda não rodou') + '</span></div><div class="card-b">' +
        (u ? '<div class="da-num"><div><b>' + (u.atribuidas || 0) + '</b><small>atribuídas</small></div><div><b' + (u.falhas ? ' class="late"' : '') + '>' + (u.falhas || 0) + '</b><small>com erro</small></div></div>' +
          (u.parou ? '<p class="da-parou">' + esc(u.parou === 'nada sem responsável' ? 'Nenhuma solicitação sem responsável.' : u.parou === 'sem aba do Onvio aberta' ? 'Não rodou: abra o Onvio numa aba deste Chrome.' : 'Parou: ' + u.parou) + '</p>' : '') +
          (pul.length ? '<p class="card-nota">Ficaram de fora: ' + esc(pul.join('; ')) + '.</p>' : '') : '<p class="card-nota da-vazio">Quando a primeira rodada acontecer, o resultado aparece aqui.</p>') +
      '</div></section>' +
      '<section class="card"><div class="card-h"><h3>Últimas atribuições</h3><span class="sub">' + log.length + (log.length === 1 ? ' registro' : ' registros') + ' · só identificação e responsável</span></div>' +
        (log.length ? '<div class="card-b flush"><div class="tabela-wrap da-log"><table class="tabela"><thead><tr><th>Quando</th><th>Solicitação</th><th>Cliente</th><th>Responsável</th></tr></thead><tbody>' +
          log.slice(0, 30).map(l => '<tr data-k="' + esc(l.k) + '" tabindex="0"><td>' + esc(hora(l.em)) + '</td><td><b>#' + esc(l.num) + '</b> ' + esc(l.typeLabel || '') + '</td><td>' + esc(l.cliente) + '</td><td>' + esc(l.resp) + '</td></tr>').join('') + '</tbody></table></div></div>' : '<div class="card-b"><p class="card-nota da-vazio">Nenhuma atribuição automática ainda.</p></div>') +
      '</section></div>' : '');

  const redesenhar = () => montarDistAuto(host, ctx);
  const mandar = async m => { const r = await enviar(m); if (r && r.ok === false) toast(r.erro || 'Não foi possível', true); return r; };
  $('#da-detalhes', host).onclick = () => { aberto = !aberto; try { localStorage.setItem('oc.daAberto', aberto ? '1' : ''); } catch (e) { /* vale só nesta visita */ } redesenhar(); };
  if ($('#da-ligar', host)) $('#da-ligar', host).onclick = () => { confirmarLigar = true; redesenhar(); const c = $('#da-senha', host); if (c) c.focus(); };
  if ($('#da-cancelar', host)) $('#da-cancelar', host).onclick = () => { confirmarLigar = false; redesenhar(); };
  if ($('#da-confirmar', host)) {
    const confirmar = async () => {
      if (!gestorLiberado()) {                                      // ligar exige a senha do gestor
        const campo = $('#da-senha', host), ok = campo && await senhaCerta(campo.value);
        if (!ok) {
          if (campo) campo.value = '';
          $('#da-erro', host).hidden = false;
          const c = $('#da-conf', host); c.classList.remove('treme'); void c.offsetWidth; c.classList.add('treme');
          if (campo) campo.focus();
          return;
        }
      }
      confirmarLigar = false;
      await mandar({ cmd: 'distribuicaoAuto', ligar: true });
      toast('Distribuição automática ligada');
      redesenhar();
    };
    $('#da-confirmar', host).onclick = confirmar;
    if ($('#da-senha', host)) $('#da-senha', host).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } };
  }
  if ($('#da-desligar', host)) $('#da-desligar', host).onclick = async () => { await mandar({ cmd: 'distribuicaoAuto', ligar: false }); toast('Distribuição automática desligada'); };
  if ($('#da-agora', host)) $('#da-agora', host).onclick = async () => {
    rodandoAgora = true; redesenhar();
    const r = await mandar({ cmd: 'distribuicaoAutoAgora' });
    rodandoAgora = false; if (host.isConnected) redesenhar();
    if (r && r.ultima) toast(r.ultima.atribuidas + (r.ultima.atribuidas === 1 ? ' atribuída' : ' atribuídas') + (r.ultima.parou && r.ultima.parou !== 'nada sem responsável' ? ' · ' + r.ultima.parou : ''), !!r.ultima.falhas);
  };
  if (aberto) ligarItens(host, log.map(l => ({ k: l.k, type: l.type, num: l.num })), ctx.abrirDetalhe);
}
