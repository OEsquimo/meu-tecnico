// Testes de VALORES: conta do total, valor padrão, extras, desconto, permissões do técnico,
// exclusão e backup. (Regras do servidor: testes/regras/regras.test.mjs, que precisam do emulador.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarAdaptadorMemoria } from '../../public/js/nucleo/adaptador-memoria.js';
import { semearDemonstracao } from '../../public/js/nucleo/demonstracao.js';
import { definirAdaptadorBanco, ler, listar } from '../../public/js/nucleo/banco.js';
import { definirAdaptadorAuth } from '../../public/js/nucleo/autenticacao.js';
import { sessao } from '../../public/js/nucleo/sessao.js';
import { PLANOS_PADRAO, REGRAS_PADRAO, TIPOS_SERVICO_PADRAO } from '../../public/js/nucleo/constantes.js';
import { calcularTotal, validarValores, documentoDeValores, lerDocumentoDeValores, MAXIMO_EXTRAS } from '../../public/js/dominio/valores.js';
import { dividirCentavos } from '../../public/js/dominio/servicos.js';
import { podeVerValores, podeAlterarValores } from '../../public/js/nucleo/permissoes.js';
import { salvarAgendamento, listarLinhasDoAgendamento, concluirServico, definirValor, buscarValores, excluirAgendamentoCompleto } from '../../public/js/servicos/servicos.js';
import { listarPrecos, definirPreco } from '../../public/js/servicos/precos.js';
import { excluirTipo } from '../../public/js/servicos/tiposServico.js';
import { permissoesDeValores } from '../../public/js/servicos/equipe.js';
import { montarBackup, lerBackup, serializarBackup } from '../../public/js/dominio/backup.js';

const E = 'demo-admin';
const TEC = { uid: 'tec-a', nome: 'Ana' };
const TIPOS = TIPOS_SERVICO_PADRAO.map((t, i) => ({ id: `t${i + 1}`, ...t }));
const limpeza = TIPOS[0];
const cliente = { id: 'c1', nome: 'Cliente', whatsapp: '5511999999999' };
const ap1 = { id: 'a1', tipo: 'split', btus: 12000, nome: 'Sala' };

async function novoBanco() {
  const memoria = criarAdaptadorMemoria();
  await semearDemonstracao(memoria);
  definirAdaptadorBanco(memoria.banco);
  definirAdaptadorAuth(memoria.auth);
  sessao.planos = Object.fromEntries(PLANOS_PADRAO.map((p) => [p.id, p]));
  sessao.regras = { ...REGRAS_PADRAO };
  sessao.empresa = await ler(`empresas/${E}`);
  sessao.vinculo = { empresaId: E, nome: 'Marcos Frio' };
  sessao.tipos = TIPOS;
}
async function linhaAgendada(hora = '09:00') {
  const id = await salvarAgendamento({ empresaId: E, cliente, endereco: null, tecnico: TEC, data: '2031-05-10', hora, observacao: '', linhas: [{ aparelho: ap1, tipo: limpeza, tecnicos: [TEC] }] });
  return (await listarLinhasDoAgendamento(E, { agendamentoId: id }))[0];
}
const concluir = (servico, papel, dados) => concluirServico({ empresaId: E, servico, papel, nomeQuemConcluiu: 'Quem', dados: { descricao: '', exigirAparelho: true, aparelho: ap1, retornoMeses: 6, ...dados } });

test('total = valor + extras - desconto, em centavos, nunca negativo', () => {
  assert.equal(calcularTotal({ baseCentavos: 15000, extras: [{ valorCentavos: 5000 }, { valorCentavos: 1050 }], descontoCentavos: 2000 }), 19050);
  assert.equal(calcularTotal({ baseCentavos: 1000, descontoCentavos: 5000 }), 0);
  assert.equal(calcularTotal({}), 0);
});

test('validarValores: lê textos, ignora linha de extra em branco e aponta erros pelo nome do campo', () => {
  const ok = validarValores({ base: '150,00', extras: [{ descricao: 'Peça', valor: '50' }, { descricao: '', valor: '' }], desconto: '20' });
  assert.ok(ok.valido);
  assert.deepEqual(ok.dados, { baseCentavos: 15000, extras: [{ descricao: 'Peça', valorCentavos: 5000 }], descontoCentavos: 2000, valorCentavos: 18000 });
  assert.ok(validarValores({ base: '' }, { exigirBase: true }).erros.valor);
  const sem = validarValores({ base: '' }, { exigirBase: false });
  assert.ok(sem.valido && sem.dados.valorCentavos === null);
  assert.ok(validarValores({ base: 'abc' }).erros.valor);
  assert.ok(validarValores({ base: '100', extras: [{ descricao: 'Peça', valor: '' }] }).erros.extras);
  assert.ok(validarValores({ base: '100', extras: [{ descricao: '', valor: '10' }] }).erros.extras);
  assert.ok(validarValores({ base: '100', desconto: 'x' }).erros.desconto);
  assert.ok(validarValores({ base: '100', desconto: '150' }).erros.desconto); // maior que o total
  assert.ok(validarValores({ base: '100', extras: Array.from({ length: MAXIMO_EXTRAS + 1 }, () => ({ descricao: 'a', valor: '1' })) }).erros.extras);
});

test('documento de valores: formato novo, número antigo e leitura de documento antigo', () => {
  assert.deepEqual(documentoDeValores(15000), { valorCentavos: 15000, baseCentavos: 15000, extras: [], descontoCentavos: 0 });
  const d = documentoDeValores({ baseCentavos: 10000, extras: [{ descricao: 'x', valorCentavos: 500 }], descontoCentavos: 100 });
  assert.equal(d.valorCentavos, 10400);
  assert.deepEqual(lerDocumentoDeValores({ valorCentavos: 12345 }), { valorCentavos: 12345, baseCentavos: 12345, extras: [], descontoCentavos: 0 });
  assert.equal(lerDocumentoDeValores(null), null);
});

test('permissões: administrador sempre; técnico só se liberado; alterar implica ver', () => {
  const admin = { estado: 'pronto', papel: 'admin' };
  const tec = (permissoes) => ({ estado: 'pronto', papel: 'tecnico', permissoes });
  assert.ok(podeVerValores(admin) && podeAlterarValores(admin));
  assert.ok(!podeVerValores(tec({})) && !podeAlterarValores(tec({})));
  assert.ok(podeVerValores(tec({ verValores: true })) && !podeAlterarValores(tec({ verValores: true })));
  assert.ok(podeVerValores(tec({ alterarValores: true })) && podeAlterarValores(tec({ alterarValores: true })));
  assert.deepEqual(permissoesDeValores({ verValores: false, alterarValores: true }), { verValores: true, alterarValores: true });
  assert.deepEqual(permissoesDeValores({}), { verValores: false, alterarValores: false });
});

test('valor padrão: grava, lê, troca e remove; excluir o tipo apaga o preço', async () => {
  await novoBanco();
  await definirPreco(E, 'tX', 15000);
  assert.equal((await listarPrecos(E)).tX, 15000);
  await definirPreco(E, 'tX', 18000);
  assert.equal((await listarPrecos(E)).tX, 18000);
  await definirPreco(E, 'tX', null);
  assert.equal((await listarPrecos(E)).tX, undefined);
  await definirPreco(E, 'tY', 9900);
  await excluirTipo(E, 'tY');
  assert.equal((await listarPrecos(E)).tY, undefined);
});

test('concluir: administrador grava valor, extras e desconto; o total é a soma', async () => {
  await novoBanco();
  const l = await linhaAgendada();
  await concluir(l, 'admin', { valores: { baseCentavos: 15000, extras: [{ descricao: 'Peça', valorCentavos: 5000 }], descontoCentavos: 2000 } });
  const v = await buscarValores(E, l.id);
  assert.deepEqual(v, { valorCentavos: 18000, baseCentavos: 15000, extras: [{ descricao: 'Peça', valorCentavos: 5000 }], descontoCentavos: 2000 });
  assert.equal((await ler(`empresas/${E}/servicos/${l.id}`)).valorDefinido, true);
});

test('concluir: descrição é opcional e o formato antigo (valorCentavos) continua valendo', async () => {
  await novoBanco();
  const l = await linhaAgendada();
  await concluir(l, 'admin', { valorCentavos: 9000, descricao: '' });
  assert.equal((await buscarValores(E, l.id)).valorCentavos, 9000);
});

test('concluir: técnico SEM permissão não grava valor (o administrador confirma depois)', async () => {
  await novoBanco();
  const l = await linhaAgendada();
  await concluir(l, 'tecnico', { valores: { baseCentavos: 99999, extras: [], descontoCentavos: 0 }, podeAlterarValores: false });
  assert.equal(await buscarValores(E, l.id), null);
  assert.equal((await ler(`empresas/${E}/servicos/${l.id}`)).valorDefinido, false);
  await definirValor(E, { ...l, status: 'concluido', dataConclusao: new Date() }, { baseCentavos: 15000, extras: [], descontoCentavos: 0 });
  assert.equal((await buscarValores(E, l.id)).valorCentavos, 15000);
});

test('concluir: técnico COM permissão grava valor e extras; sem valor informado não define nada', async () => {
  await novoBanco();
  const l1 = await linhaAgendada('09:00');
  await concluir(l1, 'tecnico', { valores: { baseCentavos: 15000, extras: [{ descricao: 'Deslocamento', valorCentavos: 3000 }], descontoCentavos: 0 }, podeAlterarValores: true });
  assert.equal((await buscarValores(E, l1.id)).valorCentavos, 18000);
  assert.equal((await ler(`empresas/${E}/servicos/${l1.id}`)).valorDefinido, true);
  const l2 = await linhaAgendada('14:00');
  await concluir(l2, 'tecnico', { valores: null, podeAlterarValores: true });
  assert.equal(await buscarValores(E, l2.id), null);
  assert.equal((await ler(`empresas/${E}/servicos/${l2.id}`)).valorDefinido, false);
});

test('administrador corrige valor, extras e desconto de serviço concluído', async () => {
  await novoBanco();
  const l = await linhaAgendada();
  await concluir(l, 'admin', { valorCentavos: 10000 });
  const concluida = { ...l, status: 'concluido', dataConclusao: new Date(), tipoServicoNome: l.tipoServicoNome };
  await definirValor(E, concluida, { baseCentavos: 10000, extras: [{ descricao: 'Gás', valorCentavos: 7000 }], descontoCentavos: 1000 });
  const v = await buscarValores(E, l.id);
  assert.equal(v.valorCentavos, 16000);
  assert.equal(v.extras.length, 1);
});

test('excluir o agendamento NÃO apaga o valor de serviço concluído (preço é histórico)', async () => {
  await novoBanco();
  const l = await linhaAgendada();
  await concluir(l, 'admin', { valores: { baseCentavos: 15000, extras: [{ descricao: 'Peça', valorCentavos: 100 }], descontoCentavos: 0 } });
  const linhas = await listarLinhasDoAgendamento(E, l);
  await assert.rejects(() => excluirAgendamentoCompleto(E, linhas), /concluídos não podem ser excluídos/);
  assert.equal((await buscarValores(E, l.id)).valorCentavos, 15100);
});

test('valores de um serviço com vários técnicos: divisão igual, centavos que sobram para os primeiros', () => {
  assert.deepEqual(dividirCentavos(18000, 3), [6000, 6000, 6000]);
  assert.deepEqual(dividirCentavos(18001, 3), [6001, 6000, 6000]);
  assert.deepEqual(dividirCentavos(18002, 3), [6001, 6001, 6000]);
});

test('backup: valor com extras e desconto e o valor padrão do tipo sobrevivem à ida e volta', () => {
  const dados = {
    empresa: { nome: 'X', diasAvisoRetorno: 15, mensagemWhatsapp: 'oi' },
    tiposServico: [{ id: 't1', nome: 'Limpeza', geraRetorno: true, retornoPadraoMeses: 6, duracaoMin: 60, ativo: true, ordem: 1 }],
    clientes: [], aparelhos: [], equipe: [],
    servicos: [{ id: 's1', clienteId: 'c1', tipoServicoId: 't1', tipoServicoNome: 'Limpeza', status: 'concluido', dataAgendada: new Date(), tecnicoUids: ['u1', 'u2'], tecnicosNomes: ['A', 'B'], ocupacaoPorTecnico: { u1: 60, u2: 60 } }],
    valores: [{ id: 's1', valorCentavos: 18000, baseCentavos: 15000, extras: [{ descricao: 'Peça', valorCentavos: 5000 }], descontoCentavos: 2000, tipoNome: 'Limpeza' }],
    precos: [{ id: 't1', valorCentavos: 15000 }],
  };
  const lido = lerBackup(serializarBackup(montarBackup(dados)));
  assert.ok(lido.ok, lido.erro);
  assert.deepEqual(lido.backup.colecoes.valores[0].extras, [{ descricao: 'Peça', valorCentavos: 5000 }]);
  assert.equal(lido.backup.colecoes.valores[0].descontoCentavos, 2000);
  assert.equal(lido.backup.colecoes.precos[0].valorCentavos, 15000);
  assert.deepEqual(lido.backup.colecoes.servicos[0].tecnicoUids, ['u1', 'u2']);
});
