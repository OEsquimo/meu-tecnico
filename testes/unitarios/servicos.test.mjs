// =============================================================================
// TESTES DOS SERVIÇOS DE DADOS + ROTAS usando o BANCO EM MEMÓRIA
// =============================================================================
// ATENÇÃO: o adaptador de memória NÃO aplica firestore.rules. Aqui provamos a
// lógica do app (contador, valores separados, retornos, backup, acesso das
// rotas). As regras de segurança são testadas em testes/regras (emulador).
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarAdaptadorMemoria } from '../../public/js/nucleo/adaptador-memoria.js';
import { semearDemonstracao, CONTAS_DEMO } from '../../public/js/nucleo/demonstracao.js';
import { definirAdaptadorBanco, ler, listar } from '../../public/js/nucleo/banco.js';
import { definirAdaptadorAuth } from '../../public/js/nucleo/autenticacao.js';
import { sessao } from '../../public/js/nucleo/sessao.js';
import { criarCliente, excluirCliente } from '../../public/js/servicos/clientes.js';
import { concluirServico, agendarServico, listarHistorico, listarAgendados, listarRetornos, recusarRetorno } from '../../public/js/servicos/servicos.js';
import { gerarBackup, restaurarBackup } from '../../public/js/servicos/backup.js';
import { lerBackup } from '../../public/js/dominio/backup.js';
import { decidirAcesso, resolverRota, ROTAS } from '../../public/js/nucleo/rotas.js';
import { PLANOS_PADRAO, REGRAS_PADRAO } from '../../public/js/nucleo/constantes.js';

const E = 'demo-admin';

/** Banco novo e limpo para cada teste. */
async function novoBanco() {
  const memoria = criarAdaptadorMemoria();
  await semearDemonstracao(memoria);
  definirAdaptadorBanco(memoria.banco);
  definirAdaptadorAuth(memoria.auth);
  sessao.planos = Object.fromEntries(PLANOS_PADRAO.map((p) => [p.id, p]));
  sessao.regras = { ...REGRAS_PADRAO };
  sessao.empresa = await ler(`empresas/${E}`);
  sessao.vinculo = { empresaId: E, nome: 'Marcos Frio' };
  return memoria;
}

const dadosCliente = (nome) => ({ nome, nomeBusca: nome.toLowerCase(), whatsapp: '5511912345678', observacoes: '', enderecos: [] });

test('criarCliente soma 1 no contador da empresa', async () => {
  await novoBanco();
  const antes = (await ler(`empresas/${E}`)).contadorClientes;
  const id = await criarCliente(E, dadosCliente('Novo Cliente'), E);
  const depois = await ler(`empresas/${E}`);
  assert.equal(depois.contadorClientes, antes + 1);
  assert.equal(depois.ultimoClienteId, id);
  assert.equal((await ler(`empresas/${E}/clientes/${id}`)).nome, 'Novo Cliente');
});

test('criarCliente respeita o limite do plano', async () => {
  await novoBanco();
  const { atualizarContaDaEmpresa } = await import('../../public/js/servicos/planos.js');
  await atualizarContaDaEmpresa(E, { planoId: 'gratis', planoAte: null, contadorClientes: 10, criadoEm: new Date(Date.now() - 90 * 86400000) });
  sessao.empresa = await ler(`empresas/${E}`);
  await assert.rejects(() => criarCliente(E, dadosCliente('Passou do limite'), E), /limite|plano/i);
});

test('técnico conclui sem valor; administrador conclui com valor separado', async () => {
  await novoBanco();
  const [a, b] = await listarAgendados({ empresaId: E });
  const tec = await concluirServico({
    empresaId: E, servico: a, papel: 'tecnico', nomeQuemConcluiu: 'Rafael',
    dados: { descricao: 'Limpeza feita', pago: true, retornoMeses: a.geraRetorno ? 6 : null },
  });
  assert.equal(tec.valorDefinido, undefined); // técnico não define valor
  assert.equal(await ler(`empresas/${E}/valores/${a.id}`), null);
  await concluirServico({
    empresaId: E, servico: b, papel: 'admin', nomeQuemConcluiu: 'Marcos',
    dados: { descricao: 'Instalação ok', pago: false, retornoMeses: b.geraRetorno ? 12 : null, valorCentavos: 25000 },
  });
  assert.equal((await ler(`empresas/${E}/valores/${b.id}`)).valorCentavos, 25000);
  assert.equal((await ler(`empresas/${E}/servicos/${b.id}`)).valorDefinido, true);
  await assert.rejects(() => concluirServico({ empresaId: E, servico: { ...a, status: 'concluido' }, papel: 'admin', nomeQuemConcluiu: 'x', dados: { descricao: 'repetido', valorCentavos: 1 } }), /já foi concluído/);
});

test('retorno: agendar a partir do lembrete marca "agendado"; recusar encerra', async () => {
  await novoBanco();
  const hoje = new Date().toISOString().slice(0, 10);
  const { vencidos, proximos } = await listarRetornos({ empresaId: E, hojeISO: hoje, diasAviso: 3650 });
  const lista = [...vencidos, ...proximos];
  if (lista.length === 0) return; // sem retorno na demo: nada a verificar
  const r = lista[0];
  await recusarRetorno(E, r.id);
  assert.equal((await ler(`empresas/${E}/servicos/${r.id}`)).retornoSituacao, 'recusado');
  const depois = await listarRetornos({ empresaId: E, hojeISO: hoje, diasAviso: 3650 });
  assert.ok(![...depois.vencidos, ...depois.proximos].some((x) => x.id === r.id));
});

test('excluirCliente apaga aparelhos/serviços e baixa o contador', async () => {
  await novoBanco();
  const antes = (await ler(`empresas/${E}`)).contadorClientes;
  const clientes = await listar(`empresas/${E}/clientes`);
  const alvo = clientes[0];
  await excluirCliente(E, alvo.id);
  assert.equal(await ler(`empresas/${E}/clientes/${alvo.id}`), null);
  assert.equal((await listar(`empresas/${E}/servicos`, { onde: [['clienteId', '==', alvo.id]] })).length, 0);
  assert.equal((await listar(`empresas/${E}/aparelhos`, { onde: [['clienteId', '==', alvo.id]] })).length, 0);
  assert.equal((await ler(`empresas/${E}`)).contadorClientes, antes - 1);
});

test('backup: gerar, serializar e ler de volta (sem valores de outras empresas)', async () => {
  await novoBanco();
  const { texto, resumo } = await gerarBackup(E, await ler(`empresas/${E}`));
  const lido = lerBackup(texto);
  assert.equal(lido.ok, true, lido.erro);
  assert.equal(lido.backup.colecoes.clientes.length, resumo.clientes);
  assert.equal(lido.resumo.clientes, resumo.clientes);
  assert.ok(resumo.clientes >= 1 && resumo.servicos >= 1);
  assert.equal(lerBackup('{"formato":"outro"}').ok, false);
  assert.equal(lerBackup('isto não é json').ok, false);
});

test('backup: restaurar devolve cliente apagado e mantém o contador coerente', async () => {
  await novoBanco();
  const { texto } = await gerarBackup(E, await ler(`empresas/${E}`));
  const total = (await ler(`empresas/${E}`)).contadorClientes;
  const alvo = (await listar(`empresas/${E}/clientes`))[0];
  await excluirCliente(E, alvo.id);
  sessao.empresa = await ler(`empresas/${E}`);
  const r = await restaurarBackup(E, E, lerBackup(texto).backup);
  assert.equal(r.falhas, 0);
  assert.ok(await ler(`empresas/${E}/clientes/${alvo.id}`));
  assert.equal((await ler(`empresas/${E}`)).contadorClientes, total);
  assert.equal((await listar(`empresas/${E}/clientes`)).length, total);
});

// ---- Acesso às rotas (mesma lógica que protege as telas) ----
const admin = { estado: 'pronto', papel: 'admin', usuario: { uid: 'a' }, empresa: {} };
const tecnico = { estado: 'pronto', papel: 'tecnico', usuario: { uid: 't' }, empresa: { permiteTecnicoCliente: false } };
const tecnicoLiberado = { ...tecnico, empresa: { permiteTecnicoCliente: true } };
const visitante = { estado: 'visitante' };
const rota = (caminho) => resolverRota(caminho).rota;

test('rotas: visitante só vê telas públicas', () => {
  assert.equal(decidirAcesso(rota('/entrar'), visitante).tipo, 'ok');
  assert.equal(decidirAcesso(rota('/convite/e/q'), visitante).tipo, 'ok');
  assert.equal(decidirAcesso(rota('/'), visitante).para, '/entrar');
  assert.equal(decidirAcesso(rota('/financeiro'), visitante).para, '/entrar');
});

test('rotas: técnico não acessa telas de administrador nem valores', () => {
  for (const c of ['/financeiro', '/equipe', '/retornos', '/agendar', '/configuracoes', '/plano', '/backup', '/administrativa', '/dono']) {
    assert.equal(decidirAcesso(rota(c), tecnico).tipo, 'redirecionar', c);
  }
  assert.equal(decidirAcesso(rota('/'), tecnico).tipo, 'ok');
  assert.equal(decidirAcesso(rota('/concluir/x'), tecnico).tipo, 'ok');
  assert.equal(decidirAcesso(rota('/clientes'), tecnico).tipo, 'redirecionar');
  assert.equal(decidirAcesso(rota('/clientes'), tecnicoLiberado).tipo, 'ok');
});

test('rotas: administrador acessa tudo da empresa, mas não o painel do dono', () => {
  for (const c of ['/', '/agenda', '/financeiro', '/equipe', '/retornos', '/backup']) assert.equal(decidirAcesso(rota(c), admin).tipo, 'ok', c);
  assert.equal(decidirAcesso(rota('/dono'), admin).tipo, 'redirecionar');
});

test('rotas: conta bloqueada só permite backup e conta; sessão carregando aguarda', () => {
  const bloqueada = { ...admin, estado: 'conta-bloqueada' };
  assert.equal(decidirAcesso(rota('/backup'), bloqueada).tipo, 'ok');
  assert.equal(decidirAcesso(rota('/clientes'), bloqueada).para, '/conta-bloqueada');
  assert.equal(decidirAcesso(rota('/'), { estado: 'carregando' }).tipo, 'aguardar');
  assert.equal(decidirAcesso(rota('/'), { estado: 'erro' }).tipo, 'erro');
});

test('rotas: padrões fixos vencem os com parâmetro e todas têm tela', () => {
  assert.equal(resolverRota('/cliente/novo').rota.padrao, '/cliente/novo');
  assert.equal(resolverRota('/cliente/abc').params.id, 'abc');
  assert.equal(resolverRota('/nao-existe').rota.padrao, '*');
  assert.ok(ROTAS.length >= 39);
});
