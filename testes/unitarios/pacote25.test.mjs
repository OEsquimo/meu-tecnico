// =============================================================================
// PACOTE 25: links curtos, "Informar o aparelho" e mensagem do técnico só com Google Maps
// (banco em memória: o banco em memória NÃO aplica firestore.rules; as regras do link curto são testadas em testes/regras)
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarAdaptadorMemoria } from '../../public/js/nucleo/adaptador-memoria.js';
import { semearDemonstracao } from '../../public/js/nucleo/demonstracao.js';
import { definirAdaptadorBanco, ler } from '../../public/js/nucleo/banco.js';
import { definirAdaptadorAuth } from '../../public/js/nucleo/autenticacao.js';
import { sessao } from '../../public/js/nucleo/sessao.js';
import { PLANOS_PADRAO, REGRAS_PADRAO, TIPOS_SERVICO_PADRAO } from '../../public/js/nucleo/constantes.js';
import { salvarAgendamento, listarLinhasDoAgendamento, informarAparelhoNaLinha } from '../../public/js/servicos/servicos.js';
import {
  consultaDoLinkDeHorarios, montarLinkDeHorarios, lerLinkDeHorarios, consultaDoPedido, lerPedidoDaConsulta, linkDoPedidoNoApp,
  codigoDeLinkCurtoValido, linkCurtoDeHorarios, linkCurtoDoPedido,
} from '../../public/js/dominio/link-horarios.js';
import { gerarCodigoCurto, linkDeHorariosParaEnviar, linkDoPedidoParaEnviar, lerLinkCurto, usaLinkCurto } from '../../public/js/servicos/links-curtos.js';
import { precisaInformarAparelhoEServico } from '../../public/js/dominio/servicos.js';
import { montarAvisoTecnico } from '../../public/js/dominio/aviso-tecnico.js';

const E = 'demo-admin';
const TEC_A = { uid: 'tec-a', nome: 'Ana Técnica' };
const TIPOS = TIPOS_SERVICO_PADRAO.map((t, i) => ({ id: `t${i + 1}`, ...t }));
const limpeza = TIPOS[0];
const cliente = { id: 'c1', nome: 'Cliente Teste', whatsapp: '5511999999999' };
const ap1 = { id: 'a1', tipo: 'split', btus: 12000, nome: 'Sala' };
const ap2 = { id: 'a2', tipo: 'janela', btus: 9000, nome: 'Quarto' };
const BASE = 'https://oesquimo.github.io/meu-tecnico/';

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

const dias = [{ iso: '2031-03-10', horas: ['08:00', '09:00', '10:00'] }, { iso: '2031-03-11', horas: ['14:00'] }];
const dadosLink = { base: BASE, empresaId: E, empresa: 'Frio Certo', whatsapp: '5511912345678', servicos: ['Limpeza', 'Instalação'], dias, geradoEm: '2031-03-09' };

test('consultaDoLinkDeHorarios é exatamente o que vai depois de "#/horarios?" e abre igual', () => {
  const { base, empresaId, ...resto } = dadosLink;
  const consulta = consultaDoLinkDeHorarios(resto);
  assert.equal(montarLinkDeHorarios({ base, ...resto }), `${base}#/horarios?${consulta}`);
  const lido = lerLinkDeHorarios(new URLSearchParams(consulta), new Date(2031, 2, 9, 7, 0));
  assert.equal(lido.valido, true);
  assert.deepEqual(lido.servicos, ['Limpeza', 'Instalação']);
  assert.equal(lido.dias.length, 2);
});

test('pedido: consultaDoPedido é o que vai depois de "#/agendar?" e lerPedidoDaConsulta devolve tudo', () => {
  const dados = { data: '2031-03-10', hora: '09:00', nome: 'Cláudia', whatsapp: '5581999991234', endereco: { rua: 'Rua A', numero: '10', cidade: 'Recife', uf: 'PE' }, referencia: 'portão azul', servicos: ['Limpeza', 'Instalação'] };
  assert.equal(linkDoPedidoNoApp(BASE, dados), `${BASE}#/agendar?${consultaDoPedido(dados)}`);
  const p = lerPedidoDaConsulta(new URLSearchParams(consultaDoPedido(dados)));
  assert.equal(p.nome, 'Cláudia');
  assert.deepEqual(p.servicos, ['Limpeza', 'Instalação']);
  assert.equal(p.endereco.rua, 'Rua A');
});

test('código e endereços do link curto', () => {
  const c = gerarCodigoCurto();
  assert.equal(codigoDeLinkCurtoValido(c), true);
  assert.notEqual(gerarCodigoCurto(), c);
  for (const ruim of ['', 'abc', 'ABCDEFGHIJ', 'abcdefghi!', 'abcdefghijk', null]) assert.equal(codigoDeLinkCurtoValido(ruim), false);
  assert.equal(linkCurtoDeHorarios(BASE, 'abcdefghij'), `${BASE}#/h/abcdefghij`);
  assert.equal(linkCurtoDoPedido(BASE, 'abcdefghij'), `${BASE}#/p/abcdefghij`);
  assert.ok(linkCurtoDeHorarios(BASE, c).length < 80);
});

test('link curto: na demonstração (memória) continua comprido; com "curtos=1" grava e o cliente lê', async () => {
  await novoBanco();
  delete globalThis.window;
  assert.equal(usaLinkCurto(), false);
  const comprido = await linkDeHorariosParaEnviar(dadosLink);
  assert.match(comprido, /#\/horarios\?e=Frio/);
  globalThis.window = { location: { search: '?demo=1&curtos=1' } };
  try {
    assert.equal(usaLinkCurto(), true);
    const curto = await linkDeHorariosParaEnviar(dadosLink);
    assert.match(curto, /#\/h\/[a-z0-9]{10}$/);
    assert.ok(curto.length < comprido.length);
    const codigo = curto.split('/h/')[1];
    const lido = await lerLinkCurto(codigo);
    assert.equal(lido.tipo, 'horarios');
    assert.equal(lido.empresaId, E);
    assert.equal(lido.vencido, false);
    const { base, empresaId, ...resto } = dadosLink;
    assert.equal(lido.consulta, consultaDoLinkDeHorarios(resto)); // o cliente abre exatamente o mesmo conteúdo do link comprido
    // pedido: link curto que leva ao mesmo pedido, citando o link de horários
    const pedido = { origem: codigo, empresaId: E, data: '2031-03-10', hora: '09:00', nome: 'Cláudia', whatsapp: '5581999991234', endereco: { rua: 'Rua A', numero: '10', cidade: 'Recife', uf: 'PE' }, referencia: '', servicos: ['Limpeza'] };
    const linkPedido = await linkDoPedidoParaEnviar(BASE, pedido);
    assert.match(linkPedido, /#\/p\/[a-z0-9]{10}$/);
    const doc = await lerLinkCurto(linkPedido.split('/p/')[1]);
    assert.equal(doc.tipo, 'pedido');
    assert.equal(doc.origem, codigo);
    assert.equal(lerPedidoDaConsulta(new URLSearchParams(doc.consulta)).nome, 'Cláudia');
    // sem código de origem (link antigo comprido): o pedido também vai comprido
    assert.match(await linkDoPedidoParaEnviar(BASE, { ...pedido, origem: '' }), /#\/agendar\?.*pedido=1/);
    // código inexistente ou fora do formato: nada
    assert.equal(await lerLinkCurto('zzzzzzzzzz'), null);
    assert.equal(await lerLinkCurto('curto'), null);
  } finally {
    delete globalThis.window;
  }
});

test('se não der para gravar o link curto, vai o comprido (nada deixa de funcionar)', async () => {
  definirAdaptadorBanco({
    nome: 'firestore', novoId: () => 'x', ler: async () => null, listar: async () => [],
    gravar: async () => { throw Object.assign(new Error('negado'), { code: 'permission-denied' }); },
  });
  assert.equal(usaLinkCurto(), true);
  assert.match(await linkDeHorariosParaEnviar(dadosLink), /#\/horarios\?e=Frio/);
  assert.match(await linkDoPedidoParaEnviar(BASE, { origem: 'abcdefghij', empresaId: E, data: '2031-03-10', hora: '09:00', nome: 'Ana', whatsapp: '', servicos: [] }), /#\/agendar\?.*pedido=1/);
  // regras ainda não publicadas: ler devolve "sem permissão" e vira "link não existe"
  definirAdaptadorBanco({ nome: 'firestore', ler: async () => { throw Object.assign(new Error('negado'), { code: 'permission-denied' }); } });
  assert.equal(await lerLinkCurto('abcdefghij'), null);
  // erro de rede sobe (a tela mostra "tentar de novo")
  definirAdaptadorBanco({ nome: 'firestore', ler: async () => { throw Object.assign(new Error('fora'), { code: 'unavailable' }); } });
  await assert.rejects(() => lerLinkCurto('abcdefghij'));
});

test('informar o aparelho: linha com serviço e sem aparelho; não conclui antes; não repete o serviço no aparelho', async () => {
  await novoBanco();
  const id = await salvarAgendamento({
    empresaId: E, cliente, endereco: null, tecnico: TEC_A, data: '2031-03-10', hora: '09:00', observacao: '',
    linhas: [{ aparelho: null, tipo: limpeza, tecnicos: [TEC_A] }, { aparelho: null, tipo: TIPOS[1], tecnicos: [TEC_A] }],
  });
  const linhas = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  assert.equal(linhas.length, 2);
  assert.ok(linhas.every((l) => l.tipoServicoId && !l.aparelhoId && precisaInformarAparelhoEServico(l)));
  const [primeira, segunda] = linhas;
  await informarAparelhoNaLinha({ empresaId: E, linhasDaVisita: linhas, linha: primeira, aparelho: ap1 });
  let depois = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  const p1 = depois.find((l) => l.id === primeira.id);
  assert.equal(p1.aparelhoId, 'a1');
  assert.ok(p1.aparelhoResumo);
  assert.equal(precisaInformarAparelhoEServico(p1), false);
  assert.equal(precisaInformarAparelhoEServico(depois.find((l) => l.id === segunda.id)), true); // a outra continua sem aparelho
  // sem aparelho escolhido: erro
  await assert.rejects(() => informarAparelhoNaLinha({ empresaId: E, linhasDaVisita: depois, linha: segunda, aparelho: null }), /aparelho/);
  // o segundo serviço pode ir para outro aparelho, ou para o mesmo (serviços diferentes)
  await informarAparelhoNaLinha({ empresaId: E, linhasDaVisita: depois, linha: segunda, aparelho: ap2, tecnico: TEC_A });
  depois = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  const p2 = depois.find((l) => l.id === segunda.id);
  assert.equal(p2.aparelhoId, 'a2');
  assert.equal(p2.adicionadoPeloTecnico, true); // técnico que informa: marcado como incluído pelo técnico
  assert.ok(depois.every((l) => !precisaInformarAparelhoEServico(l)));
});

test('informar o aparelho: o mesmo serviço não entra duas vezes no mesmo aparelho da visita', async () => {
  await novoBanco();
  const id = await salvarAgendamento({
    empresaId: E, cliente, endereco: null, tecnico: TEC_A, data: '2031-03-10', hora: '09:00', observacao: '',
    linhas: [{ aparelho: ap1, tipo: limpeza, tecnicos: [TEC_A] }, { aparelho: null, tipo: limpeza, tecnicos: [TEC_A] }],
  });
  const linhas = await listarLinhasDoAgendamento(E, { agendamentoId: id });
  const semAparelho = linhas.find((l) => !l.aparelhoId);
  await assert.rejects(() => informarAparelhoNaLinha({ empresaId: E, linhasDaVisita: linhas, linha: semAparelho, aparelho: ap1 }), /já está/);
  await informarAparelhoNaLinha({ empresaId: E, linhasDaVisita: linhas, linha: semAparelho, aparelho: ap2 }); // outro aparelho: pode
});

test('mensagem do técnico: só Google Maps, nunca Waze', () => {
  const m = montarAvisoTecnico('agendado', { tecnico: 'João', cliente: 'Maria', dataHora: new Date(2031, 2, 10, 9, 0), endereco: 'Rua A, 1', lat: -8.05, lng: -34.9, whatsappCliente: '5511912345678' });
  assert.match(m, /🗺️ Google Maps: https:\/\/www\.google\.com\/maps/);
  assert.doesNotMatch(m, /Waze|waze/);
});
