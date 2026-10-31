// =============================================================================
// TESTES DO AGENDAMENTO COM VÁRIOS APARELHOS/SERVIÇOS (banco em memória)
// =============================================================================
// Cobre: disponibilidade do técnico, agendamento só com cliente/dia/hora/técnico,
// um técnico por serviço, edição (remover/adicionar linhas), conflito de horário,
// serviço adicionado na visita, conclusão exigindo aparelho e tipo "a definir",
// validações novas e compatibilidade com serviços antigos (sem agendamentoId).
// ATENÇÃO: o banco em memória não aplica firestore.rules.
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarAdaptadorMemoria } from '../../public/js/nucleo/adaptador-memoria.js';
import { semearDemonstracao } from '../../public/js/nucleo/demonstracao.js';
import { definirAdaptadorBanco, ler, listar } from '../../public/js/nucleo/banco.js';
import { definirAdaptadorAuth } from '../../public/js/nucleo/autenticacao.js';
import { sessao } from '../../public/js/nucleo/sessao.js';
import { PLANOS_PADRAO, REGRAS_PADRAO, TIPOS_SERVICO_PADRAO } from '../../public/js/nucleo/constantes.js';
import { tecnicoEstaLivre, tecnicosLivres, intervalosSeSobrepoem } from '../../public/js/dominio/agenda.js';
import { agruparAgendamentos, chaveDoAgendamento, ehLinhaSemServico, duracaoDoServico } from '../../public/js/dominio/servicos.js';
import { validarTipoServico, validarAgendamento, validarConclusao } from '../../public/js/dominio/validacoes.js';
import { salvarAgendamento, listarLinhasDoAgendamento, adicionarServicoNaVisita, concluirServico, cancelarAgendamentoCompleto, excluirAgendamentoCompleto } from '../../public/js/servicos/servicos.js';
import { CAMPOS_PERMITIDOS } from '../../public/js/dominio/backup.js';
import {
  estadoInicial, novoGrupo, novoServico, tecnicosLivresParaServico, limparTecnicosOcupados, pendenciasDoAgendamento,
  montarLinhas, estadoDeLinhas, tecnicoSugerido, problemasDoAgendamento, duracaoDoServicoNaTela, textoDaDuracao,
} from '../../public/js/telas/agendamento-comum.js';

const E = 'demo-admin';
const TEC_A = { uid: 'tec-a', nome: 'Ana Técnica' };
const TEC_B = { uid: 'tec-b', nome: 'Bruno Técnico' };
const TIPOS = TIPOS_SERVICO_PADRAO.map((t, i) => ({ id: `t${i + 1}`, ...t }));
const limpeza = TIPOS[0]; // 60 min
const instalacao = TIPOS[2]; // 180 min
const cliente = { id: 'c1', nome: 'Cliente Teste', whatsapp: '5511999999999' };
const ap1 = { id: 'a1', tipo: 'split', btus: 12000, nome: 'Sala' };
const ap2 = { id: 'a2', tipo: 'janela', btus: 9000, nome: 'Quarto' };

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

// Dia futuro fixo, sem relação com os serviços da demonstração.
const DIA = '2031-03-10';
const base = (extra = {}) => ({ empresaId: E, cliente, endereco: null, tecnico: TEC_A, data: DIA, hora: '09:00', observacao: '', linhas: [], ...extra });

test('intervalos: encostar não é conflito; sobrepor é', () => {
  const d = (h, m = 0) => new Date(2031, 2, 10, h, m);
  assert.equal(intervalosSeSobrepoem(d(9), d(10), d(10), d(11)), false);
  assert.equal(intervalosSeSobrepoem(d(9), d(10), d(9, 30), d(10, 30)), true);
});

test('tecnicoEstaLivre: só conta serviços agendados do mesmo técnico e ignora o agendamento em edição', () => {
  const l = (o) => ({ id: o.id, status: 'agendado', tecnicoUid: 'tec-a', dataAgendada: new Date(2031, 2, 10, 9), duracaoMin: 60, ...o });
  const agendados = [l({ id: 's1' }), l({ id: 's2', tecnicoUid: 'tec-b' }), l({ id: 's3', status: 'concluido' })];
  assert.equal(tecnicoEstaLivre('tec-a', new Date(2031, 2, 10, 9, 30), 60, agendados), false);
  assert.equal(tecnicoEstaLivre('tec-a', new Date(2031, 2, 10, 10), 60, agendados), true);
  assert.equal(tecnicoEstaLivre('tec-a', new Date(2031, 2, 10, 9, 30), 60, agendados, 's1'), true); // é o próprio agendamento
  assert.equal(tecnicoEstaLivre('tec-a', new Date(2031, 2, 10, 8), 120, agendados), false); // 8h–10h pega o de 9h
  assert.deepEqual(tecnicosLivres({ tecnicos: [TEC_A, TEC_B], agendados, inicio: new Date(2031, 2, 10, 9), duracaoMin: 30 }), []);
});

test('serviço antigo sem duração/agendamentoId continua funcionando', () => {
  const antigo = { id: 'x1', status: 'agendado', tipoServicoId: 'tipo-1', dataAgendada: new Date() };
  assert.equal(chaveDoAgendamento(antigo), 'x1');
  assert.equal(duracaoDoServico(antigo), 60);
  assert.equal(ehLinhaSemServico(antigo), false);
  assert.equal(agruparAgendamentos([antigo]).length, 1);
});

test('agruparAgendamentos junta as linhas da mesma visita e define o status do grupo', () => {
  const d = new Date(2031, 2, 10, 9);
  const g = agruparAgendamentos([
    { id: '1', agendamentoId: 'v1', status: 'concluido', dataAgendada: d, clienteNome: 'C', ordem: 0 },
    { id: '2', agendamentoId: 'v1', status: 'agendado', dataAgendada: d, clienteNome: 'C', ordem: 1 },
    { id: '3', status: 'cancelado', dataAgendada: d, clienteNome: 'D' },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g.find((x) => x.chave === 'v1').status, 'agendado');
  assert.equal(g.find((x) => x.chave === '3').status, 'cancelado');
});

test('validações: duração do tipo, agendamento sem tipo e conclusão exigindo aparelho', () => {
  assert.equal(validarTipoServico({ nome: 'Teste', geraRetorno: false, duracaoMin: '' }).dados.duracaoMin, 60);
  assert.equal(validarTipoServico({ nome: 'Teste', geraRetorno: false, duracaoMin: '90' }).dados.duracaoMin, 90);
  assert.ok(validarTipoServico({ nome: 'Teste', geraRetorno: false, duracaoMin: '5' }).erros.duracaoMin);
  assert.ok(validarTipoServico({ nome: 'Teste', geraRetorno: false, duracaoMin: '9999' }).erros.duracaoMin);
  const ag = { clienteId: 'c1', tipoServicoId: '', data: DIA, hora: '09:00', descricao: '' };
  assert.ok(validarAgendamento(ag).erros.tipoServicoId); // padrão antigo continua exigindo
  assert.equal(validarAgendamento(ag, { exigirTipo: false }).valido, true);
  const conc = { descricao: 'Feito certinho', pago: false, aparelhoId: '' };
  assert.equal(validarConclusao(conc, { exigirValor: false, geraRetorno: false }).valido, true); // compatível
  assert.ok(validarConclusao(conc, { exigirValor: false, geraRetorno: false, exigirAparelho: true }).erros.aparelhoId);
  assert.equal(validarConclusao({ ...conc, aparelhoId: 'a1' }, { exigirValor: false, geraRetorno: false, exigirAparelho: true }).valido, true);
});

test('agendar só com cliente, dia, hora e técnico cria uma linha "Serviço a definir"', async () => {
  await novoBanco();
  const id = await salvarAgendamento(base({ observacao: 'Ligar antes' }));
  const linhas = await listar(`empresas/${E}/servicos`, { onde: [['agendamentoId', '==', id]] });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].tipoServicoId, '');
  assert.equal(linhas[0].tipoServicoNome, 'Serviço a definir');
  assert.equal(linhas[0].aparelhoId, null);
  assert.equal(linhas[0].tecnicoUid, 'tec-a');
  assert.equal(linhas[0].obsAgendamento, 'Ligar antes');
  assert.equal(linhas[0].status, 'agendado');
});

test('vários aparelhos e serviços: um técnico por serviço, mesma data/hora e observações guardadas', async () => {
  await novoBanco();
  const id = await salvarAgendamento(base({
    observacao: 'Portão azul',
    linhas: [
      { aparelho: ap1, tipo: limpeza, tecnico: TEC_A, obsAparelho: 'Aparelho antigo', obsServico: 'Filtro sujo' },
      { aparelho: ap1, tipo: TIPOS[4], tecnico: TEC_B },
      { aparelho: ap2, tipo: instalacao, tecnico: TEC_A },
    ],
  }));
  const linhas = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  assert.equal(linhas.length, 3);
  assert.deepEqual(linhas.map((l) => l.tecnicoUid), ['tec-a', 'tec-b', 'tec-a']);
  assert.equal(linhas[0].ocupacaoMin, 240); // Ana: limpeza 60 + instalação 180 na mesma visita
  assert.equal(linhas[1].ocupacaoMin, 60);
  assert.equal(new Set(linhas.map((l) => l.dataAgendada.getTime())).size, 1);
  assert.equal(linhas[0].obsAparelho, 'Aparelho antigo');
  assert.equal(linhas[0].obsServico, 'Filtro sujo');
  assert.equal(linhas[1].tecnicoNome, TEC_B.nome);
  assert.equal(linhas[2].duracaoMin, 180);
  assert.equal(linhas[0].geraRetorno, true);
});

test('mesmo técnico em vários serviços da visita é permitido; técnico ocupado em outro agendamento é recusado', async () => {
  await novoBanco();
  await salvarAgendamento(base({ linhas: [
    { aparelho: ap1, tipo: limpeza, tecnico: TEC_A },
    { aparelho: ap2, tipo: limpeza, tecnico: TEC_A },
  ] })); // Ana 09:00–11:00
  await assert.rejects(() => salvarAgendamento(base({ hora: '10:00', linhas: [{ aparelho: ap1, tipo: limpeza, tecnico: TEC_A }] })), /já tem outro serviço/);
  // Bruno está livre no mesmo horário; e Ana fica livre às 11:00.
  await salvarAgendamento(base({ hora: '09:30', linhas: [{ aparelho: ap1, tipo: limpeza, tecnico: TEC_B }] }));
  await salvarAgendamento(base({ hora: '11:00', linhas: [{ aparelho: ap1, tipo: limpeza, tecnico: TEC_A }] }));
});

test('soma das durações do mesmo técnico na visita também conta para o conflito', async () => {
  await novoBanco();
  await salvarAgendamento(base({ hora: '11:30', linhas: [{ aparelho: ap1, tipo: limpeza, tecnico: TEC_A }] })); // 11:30–12:30
  // 2 limpezas da Ana às 10:00 = 10:00–12:00, bate com as 11:30.
  await assert.rejects(() => salvarAgendamento(base({ hora: '10:00', linhas: [
    { aparelho: ap1, tipo: limpeza, tecnico: TEC_A }, { aparelho: ap2, tipo: limpeza, tecnico: TEC_A },
  ] })), /já tem outro serviço/);
});

test('editar: muda o horário, remove um serviço, adiciona outro e mantém as linhas já concluídas', async () => {
  await novoBanco();
  const id = await salvarAgendamento(base({ linhas: [
    { aparelho: ap1, tipo: limpeza, tecnico: TEC_A },
    { aparelho: ap2, tipo: instalacao, tecnico: TEC_B },
  ] }));
  let existentes = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  // Conclui a primeira (técnico Ana).
  await concluirServico({ empresaId: E, servico: existentes[0], papel: 'tecnico', nomeQuemConcluiu: 'Ana', dados: { descricao: 'Limpeza feita', exigirAparelho: true } });
  existentes = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  const aberta = existentes.find((l) => l.status === 'agendado');
  await salvarAgendamento(base({
    agendamentoId: id, existentes, hora: '14:00', observacao: 'Nova obs',
    linhas: [
      { id: aberta.id, aparelho: ap2, tipo: instalacao, tecnico: TEC_B, obsServico: 'Levar escada' },
      { aparelho: ap1, tipo: TIPOS[4], tecnico: TEC_A },
    ],
  }));
  const depois = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  assert.equal(depois.length, 3);
  assert.equal(depois.filter((l) => l.status === 'concluido').length, 1);
  const abertas = depois.filter((l) => l.status === 'agendado');
  assert.equal(abertas.length, 2);
  assert.ok(abertas.every((l) => l.dataAgendada.getHours() === 14));
  assert.equal(abertas.find((l) => l.id === aberta.id).obsServico, 'Levar escada');
  assert.ok(depois.every((l) => l.obsAgendamento === 'Nova obs')); // a observação geral acompanha todas
  // Remover tudo que estava aberto apaga só as abertas.
  await salvarAgendamento(base({ agendamentoId: id, existentes: depois, linhas: [] }));
  const final = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  assert.equal(final.filter((l) => l.status === 'concluido').length, 1);
  assert.equal(final.filter((l) => l.status === 'agendado').length, 1); // vira "Serviço a definir"
  assert.equal(final.find((l) => l.status === 'agendado').tipoServicoId, '');
});

test('editar não conflita com o próprio agendamento', async () => {
  await novoBanco();
  const id = await salvarAgendamento(base({ linhas: [{ aparelho: ap1, tipo: limpeza, tecnico: TEC_A }] }));
  const existentes = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  await salvarAgendamento(base({ agendamentoId: id, existentes, hora: '09:30', linhas: [{ id: existentes[0].id, aparelho: ap1, tipo: limpeza, tecnico: TEC_A }] }));
  assert.equal((await listarLinhasDoAgendamento(E, { agendamentoId: id })).length, 1);
});

test('não edita um agendamento sem linhas agendadas', async () => {
  await novoBanco();
  const id = await salvarAgendamento(base({ linhas: [{ aparelho: ap1, tipo: limpeza, tecnico: TEC_A }] }));
  const existentes = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  await cancelarAgendamentoCompleto(E, existentes);
  const canceladas = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  assert.ok(canceladas.every((l) => l.status === 'cancelado'));
  await assert.rejects(() => salvarAgendamento(base({ agendamentoId: id, existentes: canceladas, linhas: [] })), /ainda estão agendados/);
  // Cancelado libera o técnico.
  await salvarAgendamento(base({ linhas: [{ aparelho: ap1, tipo: limpeza, tecnico: TEC_A }] }));
});

test('retorno: agendar a partir de um lembrete marca o retorno como "agendado" e cancelar volta para "pendente"', async () => {
  await novoBanco();
  const origemId = 'origem-1';
  const caminho = `empresas/${E}/servicos/${origemId}`;
  const { gravar, operacao: op } = await import('../../public/js/nucleo/banco.js');
  await gravar([op.criar(caminho, { clienteId: 'c1', tipoServicoId: 't1', tipoServicoNome: 'Limpeza', status: 'concluido', retornoSituacao: 'pendente', dataAgendada: new Date(), tecnicoUid: 'x' })]);
  const id = await salvarAgendamento(base({ origemRetornoId: origemId, linhas: [{ aparelho: ap1, tipo: limpeza, tecnico: TEC_A }] }));
  assert.equal((await ler(caminho)).retornoSituacao, 'agendado');
  const linhas = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  assert.equal(linhas[0].origemRetornoId, origemId);
  await cancelarAgendamentoCompleto(E, linhas);
  assert.equal((await ler(caminho)).retornoSituacao, 'pendente');
});

test('técnico/administrador adiciona serviço na visita (aparelho obrigatório) e a linha herda dia, hora e cliente', async () => {
  await novoBanco();
  const id = await salvarAgendamento(base({ observacao: 'Obs', linhas: [{ aparelho: ap1, tipo: limpeza, tecnico: TEC_A }] }));
  const [primeira] = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  await assert.rejects(() => adicionarServicoNaVisita({ empresaId: E, base: primeira, aparelho: null, tipo: limpeza, tecnico: TEC_A }), /aparelho/i);
  const novo = await adicionarServicoNaVisita({ empresaId: E, base: primeira, aparelho: ap2, tipo: TIPOS[4], tecnico: TEC_A });
  const linha = await ler(`empresas/${E}/servicos/${novo}`);
  assert.equal(linha.agendamentoId, id);
  assert.equal(linha.clienteId, 'c1');
  assert.equal(linha.dataAgendada.getTime(), primeira.dataAgendada.getTime());
  assert.equal(linha.tecnicoUid, 'tec-a');
  assert.equal(linha.obsAgendamento, 'Obs');
  assert.equal(linha.pago, false);
  assert.equal((await listarLinhasDoAgendamento(E, { agendamentoId: id })).length, 2);
  assert.equal(linha.ocupacaoMin, 120); // Ana já tinha a limpeza (60) + carga de gás (60)
});

test('serviço antigo recebe serviço extra sem ser alterado (a linha nova usa o id dele)', async () => {
  await novoBanco();
  const { gravar, operacao: op } = await import('../../public/js/nucleo/banco.js');
  await gravar([op.criar(`empresas/${E}/servicos/antigo-1`, {
    clienteId: 'c1', clienteNome: 'C', tipoServicoId: 't1', tipoServicoNome: 'Limpeza', status: 'agendado', dataAgendada: new Date(2031, 2, 10, 9), tecnicoUid: 'tec-a', tecnicoNome: 'A', geraRetorno: true,
  })]);
  const antigo = await ler(`empresas/${E}/servicos/antigo-1`);
  await adicionarServicoNaVisita({ empresaId: E, base: antigo, aparelho: ap1, tipo: TIPOS[4], tecnico: TEC_A });
  const linhas = await listarLinhasDoAgendamento(E, antigo);
  assert.equal(linhas.length, 2);
  assert.equal((await ler(`empresas/${E}/servicos/antigo-1`)).agendamentoId, undefined);
  assert.ok(linhas.some((l) => l.id === 'antigo-1') && linhas.some((l) => l.agendamentoId === 'antigo-1'));
});

test('concluir: aparelho obrigatório; serviço "a definir" exige e grava o tipo escolhido', async () => {
  await novoBanco();
  const id = await salvarAgendamento(base());
  const [linha] = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  await assert.rejects(() => concluirServico({ empresaId: E, servico: linha, papel: 'tecnico', nomeQuemConcluiu: 'Ana', dados: { descricao: 'Feito', exigirAparelho: true, tipo: limpeza } }), /aparelho/i);
  await assert.rejects(() => concluirServico({ empresaId: E, servico: linha, papel: 'tecnico', nomeQuemConcluiu: 'Ana', dados: { descricao: 'Feito', aparelho: ap1, exigirAparelho: true } }), /tipo de serviço/i);
  await concluirServico({ empresaId: E, servico: linha, papel: 'tecnico', nomeQuemConcluiu: 'Ana', dados: { descricao: 'Feito', aparelho: ap1, tipo: limpeza, retornoMeses: 6, exigirAparelho: true } });
  const feito = await ler(`empresas/${E}/servicos/${linha.id}`);
  assert.equal(feito.status, 'concluido');
  assert.equal(feito.tipoServicoId, limpeza.id);
  assert.equal(feito.tipoServicoNome, 'Limpeza');
  assert.equal(feito.aparelhoId, 'a1');
  assert.equal(feito.retornoSituacao, 'pendente'); // o tipo escolhido gera retorno
  assert.equal(await ler(`empresas/${E}/valores/${linha.id}`), null);
});

test('concluir uma linha não conclui as outras da visita (cada serviço tem o seu botão)', async () => {
  await novoBanco();
  const id = await salvarAgendamento(base({ linhas: [
    { aparelho: ap1, tipo: limpeza, tecnico: TEC_A }, { aparelho: ap1, tipo: TIPOS[4], tecnico: TEC_B },
  ] }));
  const [a, b] = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  await concluirServico({ empresaId: E, servico: a, papel: 'admin', nomeQuemConcluiu: 'M', dados: { descricao: 'ok ok', valorCentavos: 100, retornoMeses: 6, exigirAparelho: true } });
  const depois = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  assert.deepEqual(depois.map((l) => l.status), ['concluido', 'agendado']);
  assert.equal((await ler(`empresas/${E}/valores/${a.id}`)).valorCentavos, 100);
  assert.equal(await ler(`empresas/${E}/valores/${b.id}`), null);
});

test('excluir agendamento apaga todas as linhas e os valores', async () => {
  await novoBanco();
  const id = await salvarAgendamento(base({ linhas: [{ aparelho: ap1, tipo: limpeza, tecnico: TEC_A }, { aparelho: ap2, tipo: limpeza, tecnico: TEC_B }] }));
  const linhas = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  await excluirAgendamentoCompleto(E, linhas);
  assert.equal((await listarLinhasDoAgendamento(E, { agendamentoId: id })).length, 0);
});

test('backup aceita os campos novos', () => {
  for (const campo of ['agendamentoId', 'obsAgendamento', 'obsAparelho', 'obsServico', 'duracaoMin', 'ordem']) {
    assert.ok(CAMPOS_PERMITIDOS.servicos.includes(campo), campo);
  }
  assert.ok(CAMPOS_PERMITIDOS.tiposServico.includes('duracaoMin'));
});

// ---- Lógica da tela (estado) ----
const ctxTela = (estado, agendados = [], agendamentoId = null) => ({
  estado, tecnicos: [TEC_A, TEC_B], tiposPorId: Object.fromEntries(TIPOS.map((t) => [t.id, t])), agendados, agendamentoId,
});
const ocupado = (uid, h, min = 60, extra = {}) => ({ id: `o${uid}${h}`, status: 'agendado', tecnicoUid: uid, dataAgendada: new Date(2031, 2, 10, h), duracaoMin: min, ...extra });

test('tela: só aparecem técnicos livres e o mesmo técnico soma os tempos', () => {
  const e = estadoInicial({ data: DIA, hora: '09:00' });
  const g = novoGrupo('a1'); e.grupos.push(g);
  const s1 = novoServico({ tipoId: limpeza.id, tecnicoUid: 'tec-a' });
  const s2 = novoServico({ tipoId: limpeza.id });
  g.servicos.push(s1, s2);
  assert.deepEqual(tecnicosLivresParaServico({ ...ctxTela(e), servico: s2 }).map((t) => t.uid), ['tec-a', 'tec-b']);
  const agendados = [ocupado('tec-a', 10)]; // Ana ocupada 10–11: sozinha ela cabe 9–10, mas 2 serviços (9–11) não
  assert.deepEqual(tecnicosLivresParaServico({ ...ctxTela(e, agendados), servico: s2 }).map((t) => t.uid), ['tec-b']);
  assert.deepEqual(tecnicosLivresParaServico({ ...ctxTela(e, [ocupado('tec-a', 9), ocupado('tec-b', 9)]), servico: s2 }), []);
});

test('tela: mudar a hora tira o técnico que ficou ocupado e bloqueia o agendamento sem técnico livre', () => {
  const e = estadoInicial({ data: DIA, hora: '09:00' });
  e.cliente = cliente; e.tecnicoUid = 'tec-a';
  const g = novoGrupo('a1'); e.grupos.push(g);
  g.servicos.push(novoServico({ tipoId: limpeza.id, tecnicoUid: 'tec-a' }));
  assert.deepEqual(pendenciasDoAgendamento(e, ctxTela(e)), []);
  const agendados = [ocupado('tec-a', 9)];
  assert.equal(limparTecnicosOcupados(ctxTela(e, agendados)), 1);
  assert.equal(g.servicos[0].tecnicoUid, '');
  assert.equal(e.tecnicoUid, '');
  assert.ok(pendenciasDoAgendamento(e, ctxTela(e, agendados)).some((p) => /técnico deste serviço/.test(p)));
  const todos = [ocupado('tec-a', 9), ocupado('tec-b', 9)];
  assert.ok(pendenciasDoAgendamento(e, ctxTela(e, todos)).some((p) => /Nenhum técnico está livre/.test(p)));
  e.grupos = [];
  assert.ok(pendenciasDoAgendamento(e, ctxTela(e, todos)).some((p) => /Nenhum técnico está livre/.test(p)));
  assert.deepEqual(pendenciasDoAgendamento(e, ctxTela(e, [])).length, 1); // sem serviço: falta escolher o técnico do agendamento
});

test('tela: sem cliente ou sem dia/hora não dá para agendar; sem aparelho/serviço dá (opção A)', () => {
  const e = estadoInicial({ data: DIA, hora: '09:00' });
  assert.ok(pendenciasDoAgendamento(e, ctxTela(e)).includes('Escolha o cliente.'));
  e.cliente = cliente; e.tecnicoUid = 'tec-b';
  assert.deepEqual(pendenciasDoAgendamento(e, ctxTela(e)), []);
  e.hora = '';
  assert.ok(pendenciasDoAgendamento(e, ctxTela(e)).includes('Escolha o dia e a hora.'));
});

test('tela: técnico sugerido para serviço novo é o do agendamento, se estiver livre', () => {
  const e = estadoInicial({ data: DIA, hora: '09:00' });
  e.tecnicoUid = 'tec-b';
  const s = novoServico({ tipoId: limpeza.id });
  e.grupos.push({ ...novoGrupo('a1'), servicos: [s] });
  assert.equal(tecnicoSugerido({ ...ctxTela(e), servico: s }), 'tec-b');
  assert.equal(tecnicoSugerido({ ...ctxTela(e, [ocupado('tec-b', 9)]), servico: s }), 'tec-a');
});

test('tela: estado -> linhas -> estado preserva aparelhos, serviços, técnicos e observações', () => {
  const e = estadoInicial({ data: DIA, hora: '09:00' });
  e.cliente = cliente; e.tecnicoUid = 'tec-a'; e.observacao = 'geral';
  const g1 = novoGrupo('a1'); g1.obs = 'do aparelho';
  g1.servicos.push(novoServico({ tipoId: limpeza.id, tecnicoUid: 'tec-a', obs: 'do serviço' }), novoServico({ tipoId: TIPOS[4].id, tecnicoUid: 'tec-b' }));
  const g2 = novoGrupo('a2'); // aparelho sem serviço ainda
  e.grupos.push(g1, g2);
  const linhas = montarLinhas(e, {
    tiposPorId: Object.fromEntries(TIPOS.map((t) => [t.id, t])),
    aparelhosPorId: { a1: ap1, a2: ap2 },
    tecnicosPorUid: { 'tec-a': TEC_A, 'tec-b': TEC_B },
  });
  assert.equal(linhas.length, 3);
  assert.equal(linhas[2].tipo, null);
  assert.equal(linhas[2].aparelho.id, 'a2');
  assert.equal(linhas[0].obsServico, 'do serviço');
  // Simula as linhas gravadas e volta para o estado.
  const gravadas = linhas.map((l, i) => ({
    id: `l${i}`, status: 'agendado', aparelhoId: l.aparelho?.id || null, tipoServicoId: l.tipo?.id || '', tecnicoUid: l.tecnico?.uid || null,
    obsAparelho: l.obsAparelho, obsServico: l.obsServico, obsAgendamento: 'geral', enderecoId: null,
  }));
  const volta = estadoDeLinhas(gravadas, { cliente, data: DIA, hora: '09:00' });
  assert.equal(volta.grupos.length, 2);
  assert.equal(volta.grupos[0].servicos.length, 2);
  assert.equal(volta.grupos[0].obs, 'do aparelho');
  assert.equal(volta.grupos[0].servicos[1].tecnicoUid, 'tec-b');
  assert.equal(volta.grupos[1].servicos.length, 0);
  assert.equal(volta.observacao, 'geral');
});

test('editar: linha com tipo/aparelho excluído é preservada (não é apagada) e acompanha o novo horário', async () => {
  await novoBanco();
  const id = await salvarAgendamento(base({ linhas: [
    { aparelho: ap1, tipo: limpeza, tecnico: TEC_A },
    { aparelho: ap2, tipo: instalacao, tecnico: TEC_A },
  ] }));
  const antes = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  const preservada = antes.find((l) => l.aparelhoId === 'a2');
  await salvarAgendamento(base({
    agendamentoId: id, existentes: antes, hora: '14:00',
    linhas: [{ id: antes.find((l) => l.aparelhoId === 'a1').id, aparelho: ap1, tipo: limpeza, tecnico: TEC_A }],
    preservar: [preservada.id],
  }));
  const depois = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  assert.equal(depois.length, 2);
  assert.ok(depois.every((l) => l.dataAgendada.getHours() === 14), 'as duas linhas foram para 14:00');
});

test('editar/excluir: lembrete de retorno de origem volta a "pendente" quando a linha some', async () => {
  await novoBanco();
  await salvarAgendamento(base({ agendamentoId: null, linhas: [{ aparelho: ap1, tipo: limpeza, tecnico: TEC_A }] }));
  const [origem] = await listar(`empresas/${E}/servicos`, { onde: [['status', '==', 'agendado']], limite: 1 });
  // marca uma linha da demo como "retorno agendado" apontando para a linha de origem
  const { gravar, operacao: op } = await import('../../public/js/nucleo/banco.js');
  await gravar([op.atualizar(`empresas/${E}/servicos/${origem.id}`, { retornoSituacao: 'agendado' })]);
  const id = await salvarAgendamento(base({ hora: '16:00', linhas: [{ aparelho: ap2, tipo: limpeza, tecnico: TEC_B }], origemRetornoId: origem.id }));
  const linhas = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  await excluirAgendamentoCompleto(E, linhas);
  assert.equal((await ler(`empresas/${E}/servicos/${origem.id}`)).retornoSituacao, 'pendente');
});

test('tela: duração ajustada só num serviço vale na disponibilidade, vai para as linhas e volta ao editar', () => {
  const e = estadoInicial({ data: DIA, hora: '09:00' });
  e.cliente = cliente; e.tecnicoUid = 'tec-a';
  const g = novoGrupo('a1'); e.grupos.push(g);
  const s = novoServico({ tipoId: limpeza.id, tecnicoUid: 'tec-a' }); // limpeza = 60 min
  g.servicos.push(s);
  const tiposPorId = Object.fromEntries(TIPOS.map((t) => [t.id, t]));
  assert.equal(duracaoDoServicoNaTela(s, tiposPorId), 60);
  // Ana ocupada às 10h: com 60 min ela cabe (9–10); ajustando para 120 min não cabe mais.
  const agendados = [ocupado('tec-a', 10)];
  assert.ok(tecnicosLivresParaServico({ ...ctxTela(e, agendados), servico: s }).some((t) => t.uid === 'tec-a'));
  s.duracaoMin = 120;
  assert.equal(duracaoDoServicoNaTela(s, tiposPorId), 120);
  assert.ok(!tecnicosLivresParaServico({ ...ctxTela(e, agendados), servico: s }).some((t) => t.uid === 'tec-a'));
  s.duracaoMin = 90; // 9h–10h30 ainda bate com o serviço das 10h
  assert.ok(!tecnicosLivresParaServico({ ...ctxTela(e, agendados), servico: s }).some((t) => t.uid === 'tec-a'));
  s.duracaoMin = 45;
  const linhas = montarLinhas(e, { tiposPorId, aparelhosPorId: { a1: ap1 }, tecnicosPorUid: { 'tec-a': TEC_A } });
  assert.equal(linhas[0].duracaoMin, 45);
  const volta = estadoDeLinhas([{ id: 'x', status: 'agendado', aparelhoId: 'a1', tipoServicoId: limpeza.id, tecnicoUid: 'tec-a', duracaoMin: 45 }], { cliente, data: DIA, hora: '09:00' });
  assert.equal(volta.grupos[0].servicos[0].duracaoMin, 45);
});

test('tela: textoDaDuracao', () => {
  assert.equal(textoDaDuracao(45), '45 min');
  assert.equal(textoDaDuracao(60), '1h');
  assert.equal(textoDaDuracao(90), '1h30');
});

test('tela: cada problema aponta o item para onde a tela deve rolar', () => {
  const e = estadoInicial({ data: DIA, hora: '09:00' });
  assert.deepEqual(problemasDoAgendamento(e, ctxTela(e))[0].alvo, { campo: 'clienteId' });
  e.cliente = cliente;
  const g = novoGrupo('a1'); e.grupos.push(g);
  const s = novoServico({ tipoId: limpeza.id }); g.servicos.push(s);
  assert.deepEqual(problemasDoAgendamento(e, ctxTela(e))[0].alvo, { servico: s.chave });
  s.tecnicoUid = 'tec-a';
  assert.deepEqual(problemasDoAgendamento(e, ctxTela(e)), []);
  e.hora = '';
  assert.deepEqual(problemasDoAgendamento(e, ctxTela(e))[0].alvo, { campo: 'hora' });
  e.hora = '09:00';
  assert.deepEqual(problemasDoAgendamento(e, ctxTela(e, [ocupado('tec-a', 9), ocupado('tec-b', 9)]))[0].alvo, { campo: 'hora' });
});

test('tela: observação com texto abre sozinha ao editar; vazia fica recolhida', () => {
  const linhas = [
    { id: 'x', status: 'agendado', aparelhoId: 'a1', tipoServicoId: limpeza.id, tecnicoUid: 'tec-a', obsAgendamento: 'Portão azul', obsAparelho: '', obsServico: 'Filtro sujo' },
  ];
  const e = estadoDeLinhas(linhas, { cliente, data: DIA, hora: '09:00' });
  assert.equal(e.obsAberta, true);
  assert.equal(e.grupos[0].obsAberta, false);
  assert.equal(e.grupos[0].servicos[0].obsAberta, true);
});
