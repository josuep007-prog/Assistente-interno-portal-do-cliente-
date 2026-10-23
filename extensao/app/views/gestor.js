/* Senha do gestor (trava leve, só o resumo SHA-256 em settings.senhaGestorSha256): usada na área Equipe e para ligar a
 * distribuição automática na tela Distribuir. "Liberada" vale só nesta visita (sessionStorage). */
import { estado } from '../estado.js';

let liberada = (() => { try { return sessionStorage.getItem('oc.gestor') === '1'; } catch (e) { return false; } })();
export const gestorLiberado = () => liberada;
export function liberarGestor(v) { liberada = !!v; try { v ? sessionStorage.setItem('oc.gestor', '1') : sessionStorage.removeItem('oc.gestor'); } catch (e) { /* vale só nesta visita */ } }
export async function sha256(txt) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function senhaCerta(txt) { return (await sha256(txt)) === String(estado.settings.senhaGestorSha256 || '').toLowerCase(); }
