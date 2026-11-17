/* Guarda de arranque (0.123.0, Josué 17/11/2026: a camada abria em branco, com "Carregando…" e sem dizer o porquê).
 * Script comum, carregado antes do app. Anota os erros do arranque (arquivo que não carregou, erro de script, promessa recusada) e,
 * se o app não avisar que desenhou a primeira tela (window.__appOk) em 4 segundos, mostra no lugar da tela em branco o que aconteceu,
 * com Recarregar e Copiar diagnóstico. Só texto e números: nunca dado de cliente. O app também pode chamar window.__mostrarFalha(linhas). */
(function () {
  var erros = [];
  var limpo = function (u) { return String(u || '').replace(/^chrome-extension:\/\/[^/]+\//, ''); };
  function anota(t) { t = String(t || '').replace(/\s+/g, ' ').slice(0, 300); if (t && erros.indexOf(t) < 0 && erros.length < 8) erros.push(t); }
  addEventListener('error', function (e) {
    var a = e.target;
    if (a && a !== window && (a.src || a.href)) anota('Arquivo que não carregou: ' + limpo(a.src || a.href));
    else anota((e.message || 'Erro') + (e.filename ? ' (' + limpo(e.filename) + ':' + e.lineno + ')' : ''));
  }, true);
  addEventListener('unhandledrejection', function (e) { anota('Promessa recusada: ' + ((e.reason && e.reason.message) || e.reason)); });
  function versao() { try { return chrome.runtime.getManifest().version; } catch (e) { return 'desconhecida (a extensão foi atualizada ou recarregada com esta página aberta)'; } }
  function texto() { return 'Control Onvio ' + versao() + ' · ' + location.pathname.replace(/^.*\//, '') + '\n' + (erros.length ? erros.join('\n') : 'nenhum erro registrado'); }
  window.__mostrarFalha = function (linhas) {
    var v = document.getElementById('vista'); if (!v) return;
    (linhas || []).forEach(anota);
    var f = document.createElement('div'); f.className = 'faixa'; f.setAttribute('role', 'alert'); f.style.cssText = 'margin:16px;display:block';
    var t = document.createElement('b'); t.textContent = 'A tela não carregou.'; f.appendChild(t);
    var p = document.createElement('p'); p.textContent = 'Se você atualizou ou recarregou a extensão com esta página aberta, recarregue a página (F5). Se continuar, copie o diagnóstico e envie.'; p.style.margin = '6px 0'; f.appendChild(p);
    var pre = document.createElement('pre'); pre.textContent = texto(); pre.style.cssText = 'white-space:pre-wrap;font-size:12px;margin:6px 0;user-select:text'; f.appendChild(pre);
    var b1 = document.createElement('button'); b1.type = 'button'; b1.className = 'btn btn-sm btn-primary'; b1.textContent = 'Recarregar a tela'; b1.onclick = function () { location.reload(); };
    var b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'btn btn-sm'; b2.textContent = 'Copiar diagnóstico'; b2.style.marginLeft = '8px';
    b2.onclick = function () { try { navigator.clipboard.writeText(texto()).then(function () { b2.textContent = 'Copiado'; }, function () { b2.textContent = 'Não copiou'; }); } catch (e) { b2.textContent = 'Não copiou'; } };
    f.appendChild(b1); f.appendChild(b2);
    v.textContent = ''; v.appendChild(f);
  };
  setTimeout(function () { if (!window.__appOk) window.__mostrarFalha(); }, 4000);
})();
