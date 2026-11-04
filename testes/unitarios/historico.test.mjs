// Histórico de serviços concluídos: 30 por vez, mais 30 a cada "Carregar mais", filtro por período.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarAdaptadorMemoria } from '../../public/js/nucleo/adaptador-memoria.js';
import { semearDemonstracao } from '../../public/js/nucleo/demonstracao.js';
import { definirAdaptadorBanco, gravar, operacao as op } from '../../public/js/nucleo/banco.js';
import { definirAdaptadorAuth } from '../../public/js/nucleo/autenticacao.js';
import { listarHistorico } from '../../public/js/servicos/servicos.js';
import { PAGINA_HISTORICO } from '../../public/js/nucleo/constantes.js';

const E = 'demo-admin';

async function bancoComConcluidos(qtd) {
  const memoria = criarAdaptadorMemoria();
  await semearDemonstracao(memoria);
  definirAdaptadorBanco(memoria.banco);
  definirAdaptadorAuth(memoria.auth);
  // Apaga os concluídos da demonstração para contar só os deste teste.
  const antigos = await listarHistorico({ empresaId: E, limite: 1000 });
  await gravar(antigos.map((s) => op.apagar(`empresas/${E}/servicos/${s.id}`)));
  const ops = [];
  for (let i = 0; i < qtd; i += 1) {
    ops.push(op.definir(`empresas/${E}/servicos/h${String(i).padStart(3, '0')}`, {
      status: 'concluido', clienteId: 'c', clienteNome: `Cliente ${i}`, tipoServicoNome: 'Limpeza',
      dataAgendada: new Date(2030, 0, 1 + i), dataConclusao: new Date(2030, 0, 1 + i, 10, 0), pago: false, valorDefinido: true,
    }));
  }
  await gravar(ops);
}

test('a página padrão do histórico é de 30 serviços', () => {
  assert.equal(PAGINA_HISTORICO, 30);
});

test('histórico: 30 mais recentes, depois mais 30, até acabar', async () => {
  await bancoComConcluidos(75);
  const p1 = await listarHistorico({ empresaId: E, limite: PAGINA_HISTORICO });
  assert.equal(p1.length, 30);
  assert.equal(p1[0].clienteNome, 'Cliente 74'); // o mais recente primeiro
  const p2 = await listarHistorico({ empresaId: E, limite: PAGINA_HISTORICO * 2 });
  assert.equal(p2.length, 60);
  const p3 = await listarHistorico({ empresaId: E, limite: PAGINA_HISTORICO * 3 });
  assert.equal(p3.length, 75); // menos que o limite: não há mais
});

test('histórico: período filtra pelo dia da conclusão (até é inclusivo no dia)', async () => {
  await bancoComConcluidos(40);
  const de = new Date(2030, 0, 11); // dia 11
  const ate = new Date(2030, 0, 16); // exclusivo: vai até o dia 15
  const lista = await listarHistorico({ empresaId: E, limite: 1000, de, ate });
  assert.equal(lista.length, 5);
  assert.deepEqual(lista.map((s) => s.clienteNome), ['Cliente 14', 'Cliente 13', 'Cliente 12', 'Cliente 11', 'Cliente 10']);
});
