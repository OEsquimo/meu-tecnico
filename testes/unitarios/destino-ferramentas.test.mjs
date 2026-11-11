// =============================================================================
// TESTES: destino depois do login e lista de ferramentas por papel
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';

const memoria = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: (k) => memoria.delete(k),
};
const { guardarDestino, pegarDestino, VALIDADE_DO_DESTINO_MS } = await import('../../public/js/nucleo/destino.js');
const { ferramentasDoUsuario, FERRAMENTAS } = await import('../../public/js/nucleo/ferramentas.js');

test('destino: guarda, devolve uma vez só e esquece', () => {
  guardarDestino('/agendar?data=2031-04-14', 1000);
  assert.equal(pegarDestino(2000), '/agendar?data=2031-04-14');
  assert.equal(pegarDestino(2000), null, 'só vale uma vez');
});

test('destino: vence depois de 30 minutos', () => {
  guardarDestino('/agendar', 0);
  assert.equal(pegarDestino(VALIDADE_DO_DESTINO_MS + 1), null);
});

test('destino: só aceita endereço interno (nada de //site-de-fora, nem o Início)', () => {
  for (const ruim of ['//outro.site', 'https://outro.site', '', '/', null, undefined, 42]) {
    guardarDestino(ruim, 0);
    assert.equal(pegarDestino(0), null, String(ruim));
  }
  memoria.set('meu-tecnico:destino', '{lixo');
  assert.equal(pegarDestino(0), null, 'texto estragado não quebra');
});

test('destino: sem armazenamento no navegador nada quebra', () => {
  const guardado = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } };
  assert.doesNotThrow(() => guardarDestino('/agendar'));
  assert.equal(pegarDestino(), null);
  globalThis.sessionStorage = guardado;
});

test('ferramentas: administrador vê o envio de horários; técnico não vê nenhuma', () => {
  const admin = { estado: 'pronto', papel: 'admin', usuario: {} };
  const tecnico = { estado: 'pronto', papel: 'tecnico', usuario: {} };
  assert.deepEqual(ferramentasDoUsuario(admin).map((f) => f.id), ['horarios']);
  assert.deepEqual(ferramentasDoUsuario(tecnico), []);
  assert.deepEqual(ferramentasDoUsuario({ estado: 'visitante' }), []);
  assert.ok(FERRAMENTAS.every((f) => f.id && f.titulo && f.href.startsWith('#/') && ['admin', 'membro'].includes(f.acesso)));
});
