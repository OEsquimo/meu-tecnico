// =============================================================================
// TESTES DAS REGRAS DE SEGURANÇA DO FIRESTORE (precisam do EMULADOR do Firebase)
// =============================================================================
// Como rodar (no seu computador, com Node 20+ e Java instalados):
//     npm install
//     npm run teste:regras
// O script sobe o emulador do Firestore, roda este arquivo e desliga o emulador.
//
// STATUS: escrito mas NUNCA EXECUTADO no ambiente de desenvolvimento do Claude
// (sem acesso ao npm). Se algum teste falhar, pode ser erro do teste OU da regra:
// leia a mensagem, compare com firestore.rules e corrija o lado errado.
// =============================================================================
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

const E = 'emp1'; // id da empresa de teste (= uid do admin)
const ADMIN = 'emp1';
const TEC = 'tec1';
const TEC2 = 'tec2';
const DONO = 'dono1';
const OUTRO = 'outro-admin';
const dia = (n) => Timestamp.fromMillis(Date.now() + n * 86400000);

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'meu-tecnico-teste',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => { await env.cleanup(); });

/** Estado inicial: empresa no plano médio vigente, admin, 2 técnicos, 1 cliente, 2 serviços. */
async function semear(extraEmpresa = {}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'donosApp', DONO), { criadoEm: dia(0) });
    await setDoc(doc(db, 'config/regras'), { diasTeste: 7, descontoLancamentoAtivo: false, descontoLancamentoPercentual: 0 });
    await setDoc(doc(db, 'planos/gratis'), { nome: 'Grátis', precoCentavos: 0, limiteClientes: 2, financeiroCompleto: false, ativo: true, ordem: 1 });
    await setDoc(doc(db, 'planos/medio'), { nome: 'Médio', precoCentavos: 2490, limiteClientes: 3, financeiroCompleto: true, ativo: true, ordem: 2 });
    await setDoc(doc(db, `empresas/${E}`), {
      nome: 'Frio', donoUid: ADMIN, emailAdmin: 'a@b.com', nomeAdmin: 'Admin', planoId: 'medio', planoAte: dia(10),
      testeEstendidoAte: null, bloqueada: false, contadorClientes: 1, ultimoClienteId: 'c1', permiteTecnicoCliente: false,
      diasAvisoRetorno: 15, mensagemWhatsapp: 'oi', criadoEm: dia(-60), ...extraEmpresa,
    });
    await setDoc(doc(db, `usuarios/${ADMIN}`), { empresaId: E, papel: 'admin', ativo: true, nome: 'Admin', criadoEm: dia(-60) });
    await setDoc(doc(db, `usuarios/${TEC}`), { empresaId: E, papel: 'tecnico', ativo: true, nome: 'Tec', equipeId: 'eq1', criadoEm: dia(-30) });
    await setDoc(doc(db, `usuarios/${TEC2}`), { empresaId: E, papel: 'tecnico', ativo: false, nome: 'Bloq', equipeId: 'eq2', criadoEm: dia(-30) });
    await setDoc(doc(db, `usuarios/${OUTRO}`), { empresaId: 'emp2', papel: 'admin', ativo: true, nome: 'Outro', criadoEm: dia(-30) });
    await setDoc(doc(db, 'empresas/emp2'), { nome: 'Outra', donoUid: OUTRO, planoId: 'gratis', contadorClientes: 0, criadoEm: dia(-60) });
    await setDoc(doc(db, `empresas/${E}/equipe/eq1`), { nome: 'Tec', telefone: '5511912345678', status: 'ativo', uid: TEC, criadoEm: dia(-30) });
    await setDoc(doc(db, `empresas/${E}/equipe/convite1`), { nome: 'Novo', telefone: '5511912345678', status: 'convite', uid: null, criadoEm: dia(-1) });
    await setDoc(doc(db, `empresas/${E}/clientes/c1`), { nome: 'Ana', whatsapp: '5511912345678', enderecos: [] });
    await setDoc(doc(db, `empresas/${E}/aparelhos/a1`), { clienteId: 'c1', tipo: 'split' });
    const servico = (status, tecnicoUid) => ({
      clienteId: 'c1', clienteNome: 'Ana', tipoServicoId: 't1', tipoServicoNome: 'Limpeza', status, dataAgendada: dia(1),
      tecnicoUid, tecnicoNome: 'Tec', pago: false, valorDefinido: false, geraRetorno: true,
    });
    await setDoc(doc(db, `empresas/${E}/servicos/s-tec`), servico('agendado', TEC));
    await setDoc(doc(db, `empresas/${E}/servicos/s-outro`), servico('agendado', 'outro-tecnico'));
    await setDoc(doc(db, `empresas/${E}/valores/s-tec`), { valorCentavos: 15000, tipoNome: 'Limpeza' });
  });
}
const como = (uid) => env.authenticatedContext(uid).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();
beforeEach(() => semear());

const novoCliente = (nome = 'Novo') => ({ nome, whatsapp: '5511912345678', enderecos: [], criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(), criadoPor: ADMIN });

test('sem login nada é lido nem gravado', async () => {
  const db = anonimo();
  await assertFails(getDoc(doc(db, `empresas/${E}`)));
  await assertFails(getDoc(doc(db, `empresas/${E}/clientes/c1`)));
  await assertFails(setDoc(doc(db, 'planos/hack'), { nome: 'x' }));
});

test('isolamento entre empresas: admin de outra empresa não lê nem grava aqui', async () => {
  const db = como(OUTRO);
  await assertFails(getDoc(doc(db, `empresas/${E}/clientes/c1`)));
  await assertFails(getDocs(collection(db, `empresas/${E}/servicos`)));
  await assertFails(setDoc(doc(db, `empresas/${E}/clientes/x`), novoCliente()));
});

test('valores em dinheiro: só o administrador lê', async () => {
  await assertSucceeds(getDoc(doc(como(ADMIN), `empresas/${E}/valores/s-tec`)));
  await assertFails(getDoc(doc(como(TEC), `empresas/${E}/valores/s-tec`)));
  await assertFails(setDoc(doc(como(TEC), `empresas/${E}/valores/s-tec`), { valorCentavos: 1, tipoNome: 'x' }));
});

test('técnico lê só os serviços atribuídos a ele', async () => {
  const db = como(TEC);
  await assertSucceeds(getDoc(doc(db, `empresas/${E}/servicos/s-tec`)));
  await assertFails(getDoc(doc(db, `empresas/${E}/servicos/s-outro`)));
  await assertSucceeds(getDocs(query(collection(db, `empresas/${E}/servicos`), where('tecnicoUid', '==', TEC))));
  await assertFails(getDocs(collection(db, `empresas/${E}/servicos`)));
});

test('técnico bloqueado (ativo=false) perde o acesso', async () => {
  await assertFails(getDoc(doc(como(TEC2), `empresas/${E}`)));
});

test('técnico conclui o próprio serviço, mas não altera cliente nem valor nem serviço alheio', async () => {
  const db = como(TEC);
  const concluir = { status: 'concluido', descricao: 'feito', pago: true, dataConclusao: serverTimestamp(), concluidoPorNome: 'Tec', atualizadoEm: serverTimestamp(), retornoMeses: 6, dataRetorno: '2027-04-18', retornoSituacao: 'pendente', garantiaAte: '2027-01-18' };
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-outro`), concluir));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...concluir, clienteNome: 'Hacker' }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...concluir, valorDefinido: true }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...concluir, tecnicoUid: TEC2 }));
  await assertSucceeds(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), concluir));
  await assertFails(deleteDoc(doc(db, `empresas/${E}/servicos/s-tec`)));
});

test('administrador agenda serviço válido; status inválido é recusado', async () => {
  const db = como(ADMIN);
  const base = { clienteId: 'c1', tipoServicoId: 't1', tipoServicoNome: 'Limpeza', status: 'agendado', dataAgendada: dia(2), pago: false, valorDefinido: false };
  await assertSucceeds(setDoc(doc(db, `empresas/${E}/servicos/novo`), base));
  await assertFails(setDoc(doc(db, `empresas/${E}/servicos/ruim`), { ...base, status: 'qualquer' }));
  await assertFails(setDoc(doc(db, `empresas/${E}/servicos/campo`), { ...base, campoInventado: 1 }));
});

test('cliente: criar exige subir o contador no mesmo lote', async () => {
  const db = como(ADMIN);
  const b = writeBatch(db);
  b.set(doc(db, `empresas/${E}/clientes/c2`), novoCliente());
  b.update(doc(db, `empresas/${E}`), { contadorClientes: 2, ultimoClienteId: 'c2' });
  await assertSucceeds(b.commit());
  // sem o contador: recusado
  await assertFails(setDoc(doc(db, `empresas/${E}/clientes/c3`), novoCliente()));
  // contador sem cliente: recusado
  await assertFails(updateDoc(doc(db, `empresas/${E}`), { contadorClientes: 0, ultimoClienteId: 'c1' }));
});

test('cliente: limite do plano é imposto pelo servidor', async () => {
  await semear({ planoId: 'gratis', planoAte: null, contadorClientes: 2, criadoEm: dia(-60) }); // grátis fora do teste: limite 2
  const db = como(ADMIN);
  const b = writeBatch(db);
  b.set(doc(db, `empresas/${E}/clientes/c9`), novoCliente());
  b.update(doc(db, `empresas/${E}`), { contadorClientes: 3, ultimoClienteId: 'c9' });
  await assertFails(b.commit());
});

test('cliente: plano pago vencido e conta bloqueada não cadastram', async () => {
  for (const extra of [{ planoAte: dia(-1) }, { bloqueada: true }]) {
    await semear(extra);
    const db = como(ADMIN);
    const b = writeBatch(db);
    b.set(doc(db, `empresas/${E}/clientes/cx`), novoCliente());
    b.update(doc(db, `empresas/${E}`), { contadorClientes: 2, ultimoClienteId: 'cx' });
    await assertFails(b.commit());
  }
});

test('cliente: técnico só cadastra se o administrador liberou', async () => {
  const tentar = async () => {
    const db = como(TEC);
    const b = writeBatch(db);
    b.set(doc(db, `empresas/${E}/clientes/ct`), { ...novoCliente(), criadoPor: TEC });
    b.update(doc(db, `empresas/${E}`), { contadorClientes: 2, ultimoClienteId: 'ct' });
    return b.commit();
  };
  await assertFails(tentar());
  await semear({ permiteTecnicoCliente: true });
  await assertSucceeds(tentar());
});

test('cliente: excluir exige descer o contador; técnico nunca exclui', async () => {
  const db = como(ADMIN);
  await assertFails(deleteDoc(doc(db, `empresas/${E}/clientes/c1`)));
  const b = writeBatch(db);
  b.delete(doc(db, `empresas/${E}/clientes/c1`));
  b.update(doc(db, `empresas/${E}`), { contadorClientes: 0, ultimoClienteId: 'c1' });
  await assertSucceeds(b.commit());
  await semear({ permiteTecnicoCliente: true });
  await assertFails(deleteDoc(doc(como(TEC), `empresas/${E}/clientes/c1`)));
});

test('pacote 18: o administrador muda o nome da empresa e o próprio nome (nomeAdmin), com limites', async () => {
  const admin = como(ADMIN);
  await assertSucceeds(updateDoc(doc(admin, `empresas/${E}`), { nome: 'Frio Novo', nomeAdmin: 'Novo Nome', adminAtende: true }));
  await assertSucceeds(updateDoc(doc(admin, `usuarios/${ADMIN}`), { nome: 'Novo Nome', telefone: '(81) 98325-9346' }));
  await assertFails(updateDoc(doc(admin, `empresas/${E}`), { nomeAdmin: '' }), 'nomeAdmin vazio');
  await assertFails(updateDoc(doc(admin, `empresas/${E}`), { nomeAdmin: 'x'.repeat(101) }), 'nomeAdmin longo demais');
  await assertFails(updateDoc(doc(admin, `empresas/${E}`), { nomeAdmin: 123 }), 'nomeAdmin não texto');
  await assertFails(updateDoc(doc(como(OUTRO), `empresas/${E}`), { nomeAdmin: 'Invasor' }), 'admin de outra empresa');
  await assertFails(updateDoc(doc(como(TEC), `empresas/${E}`), { nomeAdmin: 'Técnico' }), 'técnico não muda');
  await assertFails(updateDoc(doc(admin, `empresas/${E}`), { emailAdmin: 'outro@x.com' }), 'e-mail do login não muda por aqui');
});

test('pacote 19: o administrador edita os 3 avisos ao cliente (até 600 letras, só texto)', async () => {
  const admin = como(ADMIN);
  await assertSucceeds(updateDoc(doc(admin, `empresas/${E}`), { avisoAgendado: 'Olá {nome}', avisoCancelado: 'Cancelamos', avisoReagendado: 'Remarcamos' }));
  await assertFails(updateDoc(doc(admin, `empresas/${E}`), { avisoAgendado: 'x'.repeat(601) }), 'aviso longo demais');
  await assertFails(updateDoc(doc(admin, `empresas/${E}`), { avisoCancelado: 123 }), 'aviso não texto');
  await assertFails(updateDoc(doc(como(OUTRO), `empresas/${E}`), { avisoAgendado: 'Invasor' }), 'admin de outra empresa');
  await assertFails(updateDoc(doc(como(TEC), `empresas/${E}`), { avisoAgendado: 'Técnico' }), 'técnico não muda');
});

test('empresa: administrador não troca plano, validade nem bloqueio; dono do app troca', async () => {
  const admin = como(ADMIN);
  await assertFails(updateDoc(doc(admin, `empresas/${E}`), { planoId: 'ilimitado' }));
  await assertFails(updateDoc(doc(admin, `empresas/${E}`), { bloqueada: false, planoAte: dia(999) }));
  await assertSucceeds(updateDoc(doc(admin, `empresas/${E}`), { nome: 'Novo nome', diasAvisoRetorno: 10, mensagemWhatsapp: 'olá', permiteTecnicoCliente: true }));
  const dono = como(DONO);
  await assertSucceeds(updateDoc(doc(dono, `empresas/${E}`), { planoId: 'medio', planoAte: dia(30) }));
  await assertSucceeds(updateDoc(doc(dono, `empresas/${E}`), { bloqueada: true }));
  await assertFails(updateDoc(doc(dono, `empresas/${E}`), { nome: 'dono não edita nome' }));
});

test('planos e regras globais: só o dono do app grava', async () => {
  const plano = { nome: 'Novo', precoCentavos: 1000, limiteClientes: 5, financeiroCompleto: true, ativo: true, ordem: 9, descricao: '' };
  await assertFails(setDoc(doc(como(ADMIN), 'planos/novo'), plano));
  await assertSucceeds(setDoc(doc(como(DONO), 'planos/novo'), plano));
  await assertFails(deleteDoc(doc(como(DONO), 'planos/gratis')));
  await assertSucceeds(getDoc(doc(como(TEC), 'planos/medio')));
  await assertFails(setDoc(doc(como(ADMIN), 'config/regras'), { diasTeste: 999 }));
  await assertSucceeds(setDoc(doc(como(DONO), 'config/regras'), { diasTeste: 14, descontoLancamentoAtivo: false, descontoLancamentoPercentual: 0 }));
  await assertFails(setDoc(doc(como(DONO), 'donosApp/novo'), { x: 1 })); // ninguém cria dono pelo app
});

test('cadastro: nova conta cria empresa grátis + vínculo no mesmo lote; não escolhe plano', async () => {
  const uid = 'novo-usuario';
  const db = como(uid);
  const empresa = (extra = {}) => ({
    nome: 'Minha', donoUid: uid, emailAdmin: 'n@x.com', nomeAdmin: 'Novo', planoId: 'gratis', planoAte: null, testeEstendidoAte: null,
    bloqueada: false, contadorClientes: 0, permiteTecnicoCliente: false, diasAvisoRetorno: 15, mensagemWhatsapp: 'oi', criadoEm: serverTimestamp(), ...extra,
  });
  const vinculo = { empresaId: uid, papel: 'admin', ativo: true, nome: 'Novo', criadoEm: serverTimestamp() };
  // trapaça: plano ilimitado
  const ruim = writeBatch(db);
  ruim.set(doc(db, `empresas/${uid}`), empresa({ planoId: 'medio', planoAte: dia(365) }));
  ruim.set(doc(db, `usuarios/${uid}`), vinculo);
  await assertFails(ruim.commit());
  // correto
  const b = writeBatch(db);
  b.set(doc(db, `empresas/${uid}`), empresa());
  b.set(doc(db, `usuarios/${uid}`), vinculo);
  await assertSucceeds(b.commit());
  // depois do cadastro, os tipos padrão entram num segundo lote
  await assertSucceeds(setDoc(doc(db, `empresas/${uid}/tiposServico/t1`), { nome: 'Limpeza', geraRetorno: true, retornoPadraoMeses: 6, ativo: true, ordem: 1 }));
});

test('convite: técnico aceita com lote válido; uid de outra pessoa é recusado; técnico sozinho não vira admin', async () => {
  const uid = 'novo-tecnico';
  const db = como(uid);
  const vinculo = { empresaId: E, papel: 'tecnico', ativo: true, nome: 'Novo', equipeId: 'convite1', criadoEm: serverTimestamp() };
  const ruim = writeBatch(db);
  ruim.set(doc(db, `usuarios/${uid}`), vinculo);
  ruim.update(doc(db, `empresas/${E}/equipe/convite1`), { uid: 'outra-pessoa', status: 'ativo' });
  await assertFails(ruim.commit());
  await assertFails(setDoc(doc(db, `usuarios/${uid}`), { ...vinculo, papel: 'admin' }));
  const b = writeBatch(db);
  b.set(doc(db, `usuarios/${uid}`), vinculo);
  b.update(doc(db, `empresas/${E}/equipe/convite1`), { uid, status: 'ativo' });
  await assertSucceeds(b.commit());
});

test('equipe: só o administrador lista e cria convites', async () => {
  await assertSucceeds(getDocs(collection(como(ADMIN), `empresas/${E}/equipe`)));
  await assertFails(getDocs(collection(como(TEC), `empresas/${E}/equipe`)));
  const convite = { nome: 'X', telefone: '5511912345678', status: 'convite', uid: null, criadoEm: serverTimestamp() };
  await assertSucceeds(setDoc(doc(como(ADMIN), `empresas/${E}/equipe/novo`), convite));
  await assertFails(setDoc(doc(como(TEC), `empresas/${E}/equipe/novo2`), convite));
});

test('admin bloqueia técnico (usuarios.ativo) mas não muda o papel dele', async () => {
  const db = como(ADMIN);
  await assertSucceeds(updateDoc(doc(db, `usuarios/${TEC}`), { ativo: false }));
  await assertFails(updateDoc(doc(db, `usuarios/${TEC}`), { papel: 'admin' }));
  await assertFails(updateDoc(doc(como(TEC), `usuarios/${TEC}`), { ativo: true, papel: 'admin' }));
});

// -----------------------------------------------------------------------------
// AGENDAMENTO COM VÁRIOS APARELHOS/SERVIÇOS (campos novos e permissões do técnico)
// STATUS: escritos mas NÃO executados (sem emulador no ambiente de desenvolvimento).
// -----------------------------------------------------------------------------
const linhaNova = (extra = {}) => ({
  clienteId: 'c1', clienteNome: 'Ana', tipoServicoId: 't1', tipoServicoNome: 'Limpeza', geraRetorno: true, status: 'agendado',
  dataAgendada: dia(1), tecnicoUid: TEC, tecnicoNome: 'Tec', pago: false, valorDefinido: false, descricao: '',
  agendamentoId: 'v1', obsAgendamento: 'obs', obsAparelho: '', obsServico: '', duracaoMin: 60, ocupacaoMin: 60, ordem: 0, ...extra,
});

test('agendamento: administrador grava os campos novos e a linha "Serviço a definir"', async () => {
  const db = como(ADMIN);
  await assertSucceeds(setDoc(doc(db, `empresas/${E}/servicos/n1`), linhaNova()));
  await assertSucceeds(setDoc(doc(db, `empresas/${E}/servicos/n2`), linhaNova({ tipoServicoId: '', tipoServicoNome: 'Serviço a definir', geraRetorno: false, aparelhoId: null })));
  await assertFails(setDoc(doc(db, `empresas/${E}/servicos/n3`), linhaNova({ duracaoMin: 5 })));
  await assertFails(setDoc(doc(db, `empresas/${E}/servicos/n4`), linhaNova({ obsServico: 'x'.repeat(501) })));
  await assertFails(setDoc(doc(db, `empresas/${E}/servicos/n5`), linhaNova({ campoInventado: 1 })));
});

test('tipos de serviço: duração entre 15 e 720 minutos', async () => {
  const db = como(ADMIN);
  const tipo = { nome: 'Teste', geraRetorno: false, retornoPadraoMeses: 0, ativo: true, ordem: 1 };
  await assertSucceeds(setDoc(doc(db, `empresas/${E}/tiposServico/x1`), { ...tipo, duracaoMin: 90 }));
  await assertSucceeds(setDoc(doc(db, `empresas/${E}/tiposServico/x2`), tipo)); // tipos antigos sem duração continuam válidos
  await assertFails(setDoc(doc(db, `empresas/${E}/tiposServico/x3`), { ...tipo, duracaoMin: 10 }));
  await assertFails(setDoc(doc(db, `empresas/${E}/tiposServico/x4`), { ...tipo, duracaoMin: 721 }));
});

test('técnico adiciona serviço na própria visita, mas não para outro técnico nem já concluído nem com valor', async () => {
  const db = como(TEC);
  await assertSucceeds(setDoc(doc(db, `empresas/${E}/servicos/t1`), linhaNova({ adicionadoPeloTecnico: true, vistoPeloAdmin: false })));
  await assertFails(setDoc(doc(db, `empresas/${E}/servicos/tv`), linhaNova({ adicionadoPeloTecnico: true, vistoPeloAdmin: true }))); // técnico não nasce "visto"
  await assertFails(setDoc(doc(db, `empresas/${E}/servicos/t0`), linhaNova())); // sem a marca de acrescentado em campo
  await assertFails(setDoc(doc(db, `empresas/${E}/servicos/t2`), linhaNova({ tecnicoUid: 'outro-tecnico' })));
  await assertFails(setDoc(doc(db, `empresas/${E}/servicos/t3`), linhaNova({ status: 'concluido' })));
  await assertFails(setDoc(doc(db, `empresas/${E}/servicos/t4`), linhaNova({ valorDefinido: true })));
  await assertFails(setDoc(doc(db, `empresas/${E}/servicos/t5`), linhaNova({ tipoServicoId: '' })));
  await assertFails(setDoc(doc(db, `empresas/${E}/valores/t1`), { valorCentavos: 1, tipoNome: 'x' }));
});

test('técnico só escolhe o tipo ao concluir quando o serviço estava "a definir"', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `empresas/${E}/servicos/def`), linhaNova({ tipoServicoId: '', tipoServicoNome: 'Serviço a definir', geraRetorno: false }));
  });
  const db = como(TEC);
  const conclusao = { status: 'concluido', descricao: 'Feito', pago: false, dataConclusao: serverTimestamp(), aparelhoId: 'a1', aparelhoResumo: 'Split', concluidoPorNome: 'Tec', atualizadoEm: serverTimestamp() };
  // Serviço com tipo definido: trocar o tipo é recusado.
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...conclusao, tipoServicoId: 'outro', tipoServicoNome: 'Outro' }));
  // Serviço "a definir": escolher o tipo ao concluir é aceito.
  await assertSucceeds(updateDoc(doc(db, `empresas/${E}/servicos/def`), { ...conclusao, tipoServicoId: 't1', tipoServicoNome: 'Limpeza', geraRetorno: true, duracaoMin: 60 }));
});

// =============================================================================
// VALORES, PERMISSÕES DO TÉCNICO E VÁRIOS TÉCNICOS POR SERVIÇO
// =============================================================================
/** Libera (ou não) valores para o técnico `eq1` (cadastro em equipe/eq1). */
async function liberar({ verValores = false, alterarValores = false }) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), `empresas/${E}/equipe/eq1`), { verValores, alterarValores });
  });
}
const conclusao = (extra = {}) => ({ status: 'concluido', descricao: '', pago: false, dataConclusao: serverTimestamp(), concluidoPorNome: 'Tec', atualizadoEm: serverTimestamp(), retornoMeses: 6, dataRetorno: '2027-04-18', retornoSituacao: 'pendente', garantiaAte: '2027-01-18', ...extra });
const valorNovo = (extra = {}) => ({ valorCentavos: 18000, baseCentavos: 15000, extras: [{ descricao: 'Peça', valorCentavos: 5000 }], descontoCentavos: 2000, tipoNome: 'Limpeza', dataConclusao: serverTimestamp(), atualizadoEm: serverTimestamp(), ...extra });

test('valores: técnico sem permissão não lê valor nem preço padrão', async () => {
  const db = como(TEC);
  await assertFails(getDoc(doc(db, `empresas/${E}/valores/s-tec`)));
  await assertFails(getDocs(collection(db, `empresas/${E}/precos`)));
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `empresas/${E}/precos/t1`), { valorCentavos: 15000 }); });
  await assertFails(getDoc(doc(db, `empresas/${E}/precos/t1`)));
});

test('valores: "pode ver" lê o valor do próprio serviço e os preços, mas não altera nada', async () => {
  await liberar({ verValores: true });
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `empresas/${E}/precos/t1`), { valorCentavos: 15000 }); });
  const db = como(TEC);
  await assertSucceeds(getDoc(doc(db, `empresas/${E}/valores/s-tec`)));
  await assertFails(getDoc(doc(db, `empresas/${E}/valores/s-outro`))); // serviço de outro técnico
  await assertFails(getDocs(collection(db, `empresas/${E}/valores`))); // nunca a lista
  await assertSucceeds(getDocs(collection(db, `empresas/${E}/precos`)));
  await assertFails(setDoc(doc(db, `empresas/${E}/precos/t1`), { valorCentavos: 1 }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/valores/s-tec`), { valorCentavos: 1 }));
  // Concluir sem valor continua permitido; valorDefinido e valor não.
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), conclusao({ valorDefinido: true })));
  await assertSucceeds(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), conclusao()));
});

test('valores: "pode alterar" grava valor + extras ao concluir, uma vez, e só do próprio serviço', async () => {
  await liberar({ alterarValores: true });
  await env.withSecurityRulesDisabled(async (ctx) => { await deleteDoc(doc(ctx.firestore(), `empresas/${E}/valores/s-tec`)); });
  const db = como(TEC);
  // Gravar o valor sem concluir no mesmo lote: recusado.
  await assertFails(setDoc(doc(db, `empresas/${E}/valores/s-tec`), valorNovo()));
  // valorDefinido sem gravar o valor: recusado.
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), conclusao({ valorDefinido: true })));
  // Lote completo: conclui + grava valor.
  const b = writeBatch(db);
  b.update(doc(db, `empresas/${E}/servicos/s-tec`), conclusao({ valorDefinido: true }));
  b.set(doc(db, `empresas/${E}/valores/s-tec`), valorNovo());
  await assertSucceeds(b.commit());
  // Depois de concluído, o técnico não altera mais o valor; o administrador sim.
  await assertFails(updateDoc(doc(db, `empresas/${E}/valores/s-tec`), { valorCentavos: 1 }));
  await assertSucceeds(updateDoc(doc(como(ADMIN), `empresas/${E}/valores/s-tec`), valorNovo({ valorCentavos: 17000 })));
  // Valor de serviço de outro técnico: recusado.
  const c = writeBatch(db);
  c.update(doc(db, `empresas/${E}/servicos/s-outro`), conclusao({ valorDefinido: true }));
  c.set(doc(db, `empresas/${E}/valores/s-outro`), valorNovo());
  await assertFails(c.commit());
});

test('valores: formato inválido é recusado (negativo, campo estranho, extras demais)', async () => {
  const db = como(ADMIN);
  await assertSucceeds(setDoc(doc(db, `empresas/${E}/valores/s-tec`), valorNovo()));
  await assertFails(setDoc(doc(db, `empresas/${E}/valores/s-tec`), valorNovo({ valorCentavos: -1 })));
  await assertFails(setDoc(doc(db, `empresas/${E}/valores/s-tec`), valorNovo({ campoInventado: 1 })));
  await assertFails(setDoc(doc(db, `empresas/${E}/valores/s-tec`), valorNovo({ extras: Array.from({ length: 21 }, () => ({ descricao: 'x', valorCentavos: 1 })) })));
  await assertFails(setDoc(doc(db, `empresas/${E}/valores/s-tec`), valorNovo({ descontoCentavos: 'dez' })));
});

test('preços padrão: administrador grava e apaga; valor inválido é recusado; outra empresa não lê', async () => {
  const db = como(ADMIN);
  await assertSucceeds(setDoc(doc(db, `empresas/${E}/precos/t1`), { valorCentavos: 15000, atualizadoEm: serverTimestamp() }));
  await assertFails(setDoc(doc(db, `empresas/${E}/precos/t1`), { valorCentavos: -5 }));
  await assertFails(setDoc(doc(db, `empresas/${E}/precos/t1`), { valorCentavos: 100, outro: 1 }));
  await assertFails(getDoc(doc(como(OUTRO), `empresas/${E}/precos/t1`)));
  await assertSucceeds(deleteDoc(doc(db, `empresas/${E}/precos/t1`)));
});

test('equipe: técnico lê o próprio cadastro (permissões) mas não o de outro e não se libera sozinho', async () => {
  const db = como(TEC);
  await assertSucceeds(getDoc(doc(db, `empresas/${E}/equipe/eq1`)));
  await assertFails(getDoc(doc(db, `empresas/${E}/equipe/eq2`)));
  await assertFails(updateDoc(doc(db, `empresas/${E}/equipe/eq1`), { alterarValores: true }));
  const adm = como(ADMIN);
  await assertSucceeds(updateDoc(doc(adm, `empresas/${E}/equipe/eq1`), { nome: 'Tec', telefone: '5511912345678', status: 'ativo', verValores: true, alterarValores: false }));
  await assertFails(updateDoc(doc(adm, `empresas/${E}/equipe/eq1`), { verValores: 'sim' }));
});

test('vários técnicos: cada um lê, consulta e conclui o serviço; o administrador grava a lista', async () => {
  const lista = { tecnicoUid: 'outro-tecnico', tecnicoNome: 'Outro', tecnicoUids: ['outro-tecnico', TEC], tecnicosNomes: ['Outro', 'Tec'], ocupacaoPorTecnico: { 'outro-tecnico': 60, [TEC]: 60 } };
  const base = { clienteId: 'c1', clienteNome: 'Ana', tipoServicoId: 't1', tipoServicoNome: 'Limpeza', status: 'agendado', dataAgendada: dia(1), pago: false, valorDefinido: false, geraRetorno: true };
  await assertSucceeds(setDoc(doc(como(ADMIN), `empresas/${E}/servicos/multi`), { ...base, ...lista }));
  await assertFails(setDoc(doc(como(ADMIN), `empresas/${E}/servicos/multi2`), { ...base, ...lista, tecnicoUids: Array.from({ length: 21 }, (_, i) => `u${i}`) }));
  const db = como(TEC);
  await assertSucceeds(getDoc(doc(db, `empresas/${E}/servicos/multi`)));
  await assertSucceeds(getDocs(query(collection(db, `empresas/${E}/servicos`), where('tecnicoUids', 'array-contains', TEC))));
  await assertFails(getDocs(query(collection(db, `empresas/${E}/servicos`), where('tecnicoUids', 'array-contains', 'outro-tecnico'))));
  // O segundo técnico conclui; a conclusão vale para o serviço inteiro, mas ele não muda os técnicos.
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/multi`), conclusao({ tecnicoUids: [TEC] })));
  await assertSucceeds(updateDoc(doc(db, `empresas/${E}/servicos/multi`), conclusao()));
});

test('vários técnicos: técnico só adiciona serviço para si mesmo (lista com ele sozinho)', async () => {
  const db = como(TEC);
  await assertSucceeds(setDoc(doc(db, `empresas/${E}/servicos/m1`), linhaNova({ adicionadoPeloTecnico: true, vistoPeloAdmin: false, tecnicoUids: [TEC], tecnicosNomes: ['Tec'] })));
  await assertFails(setDoc(doc(db, `empresas/${E}/servicos/m2`), linhaNova({ tecnicoUids: [TEC, 'outro-tecnico'], tecnicosNomes: ['Tec', 'Outro'] })));
});

test('cobrança: só o administrador grava Pix, texto e tom; limites e tom inválido são recusados', async () => {
  const admin = como(ADMIN);
  await assertSucceeds(updateDoc(doc(admin, `empresas/${E}`), { chavePix: '11999998888', mensagemCobranca: 'Olá {nome}, {valor}', tomCobranca: 'formal' }));
  await assertFails(updateDoc(doc(admin, `empresas/${E}`), { tomCobranca: 'bravo' }));
  await assertFails(updateDoc(doc(admin, `empresas/${E}`), { chavePix: 'x'.repeat(101) }));
  await assertFails(updateDoc(doc(admin, `empresas/${E}`), { mensagemCobranca: 'x'.repeat(601) }));
  await assertFails(updateDoc(doc(como(TEC), `empresas/${E}`), { chavePix: 'meu pix' }));
});

test('cobrança: o administrador anota "cobrado em" no serviço concluído; o técnico não', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), `empresas/${E}/servicos/s-tec`), { status: 'concluido', dataConclusao: dia(0) });
  });
  await assertSucceeds(updateDoc(doc(como(ADMIN), `empresas/${E}/servicos/s-tec`), { cobradoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(doc(como(TEC), `empresas/${E}/servicos/s-tec`), { cobradoEm: serverTimestamp() }));
});

test('pendente: o técnico devolve o próprio serviço agendado com motivo, e nada além disso', async () => {
  const db = como(TEC);
  const pendente = { status: 'cancelado', pendente: true, motivoPendencia: 'Faltou peça', atualizadoEm: serverTimestamp() };
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-outro`), pendente)); // serviço de outro técnico
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...pendente, clienteNome: 'Hacker' }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...pendente, pendente: false }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...pendente, motivoPendencia: 'x'.repeat(201) }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...pendente, status: 'concluido' }));
  await assertSucceeds(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), pendente));
  // Já cancelado: o técnico não mexe de novo (só o administrador reagenda).
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...pendente, motivoPendencia: 'outro' }));
  await assertSucceeds(updateDoc(doc(como(ADMIN), `empresas/${E}/servicos/s-tec`), { status: 'agendado', pendente: false, motivoPendencia: '', atualizadoEm: serverTimestamp() }));
});

test('pacote 21: o técnico só MARCA o atraso no próprio serviço agendado', async () => {
  const db = como(TEC);
  const atraso = { atrasoPorTecnico: true, atrasoTecnicoNome: 'Tec', atualizadoEm: serverTimestamp() };
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-outro`), atraso)); // serviço de outro técnico
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...atraso, atrasoPorTecnico: false })); // não desmarca
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...atraso, status: 'concluido' })); // nada além do atraso
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...atraso, atrasoTecnicoNome: 'x'.repeat(121) }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { atrasoPorTecnico: true })); // sem a hora do servidor: não passa
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...atraso, atualizadoEm: new Date(2020, 0, 1) })); // hora inventada
  await assertSucceeds(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), atraso));
});

test('pacote 3: o administrador marca "reagendado" no serviço (só booleano)', async () => {
  await assertSucceeds(updateDoc(doc(como(ADMIN), `empresas/${E}/servicos/s-tec`), { reagendado: true, atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(doc(como(ADMIN), `empresas/${E}/servicos/s-tec`), { reagendado: 'sim', atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(doc(como(TEC), `empresas/${E}/servicos/s-tec`), { reagendado: true }));
});

test('pacote 4: o técnico corrige e exclui só o serviço que ele acrescentou, ainda agendado', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore(); // uma vez só: o emulador não aceita configurar de novo
    await setDoc(doc(f, `empresas/${E}/servicos/doadmin`), linhaNova());
    await setDoc(doc(f, `empresas/${E}/servicos/dele`), linhaNova({ adicionadoPeloTecnico: true, vistoPeloAdmin: false }));
    await setDoc(doc(f, `empresas/${E}/servicos/feito`), linhaNova({ adicionadoPeloTecnico: true, status: 'concluido', dataConclusao: dia(0) }));
  });
  const db = como(TEC);
  const troca = { tipoServicoId: 't2', tipoServicoNome: 'Instalação', geraRetorno: false, atualizadoEm: serverTimestamp() };
  await assertSucceeds(updateDoc(doc(db, `empresas/${E}/servicos/dele`), troca));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/dele`), { ...troca, dataAgendada: dia(5) })); // só tipo/aparelho
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/doadmin`), troca)); // marcado pelo administrador
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/feito`), troca)); // já concluído
  await assertFails(deleteDoc(doc(db, `empresas/${E}/servicos/doadmin`)));
  await assertFails(deleteDoc(doc(db, `empresas/${E}/servicos/feito`)));
  await assertSucceeds(deleteDoc(doc(db, `empresas/${E}/servicos/dele`)));
});

test('pacote 5: só o administrador marca o serviço incluído como visto', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `empresas/${E}/servicos/inc`), linhaNova({ adicionadoPeloTecnico: true, vistoPeloAdmin: false }));
  });
  await assertFails(updateDoc(doc(como(TEC), `empresas/${E}/servicos/inc`), { vistoPeloAdmin: true }));
  await assertSucceeds(updateDoc(doc(como(ADMIN), `empresas/${E}/servicos/inc`), { vistoPeloAdmin: true }));
  await assertFails(updateDoc(doc(como(ADMIN), `empresas/${E}/servicos/inc`), { vistoPeloAdmin: 'sim' }));
});

test('pacote 6: o técnico informa aparelho e serviço só na linha dele que está "a definir"', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    await setDoc(doc(f, `empresas/${E}/servicos/adef`), linhaNova({ tipoServicoId: '', tipoServicoNome: 'Serviço a definir', geraRetorno: false, aparelhoId: null }));
    await setDoc(doc(f, `empresas/${E}/servicos/completa`), linhaNova({ aparelhoId: 'a1', aparelhoResumo: 'Split 12.000 BTUs' })); // já tem aparelho e serviço
    await setDoc(doc(f, `empresas/${E}/servicos/alheia`), linhaNova({ tipoServicoId: '', tipoServicoNome: 'Serviço a definir', aparelhoId: null, tecnicoUid: TEC2, tecnicoUids: [TEC2] }));
  });
  const db = como(TEC);
  const informa = { aparelhoId: 'a1', aparelhoResumo: 'Split 12.000 BTUs', tipoServicoId: 't1', tipoServicoNome: 'Limpeza', geraRetorno: true, adicionadoPeloTecnico: true, vistoPeloAdmin: false, atualizadoEm: serverTimestamp() };
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/adef`), { ...informa, adicionadoPeloTecnico: false })); // tem de ficar marcada
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/adef`), { ...informa, dataAgendada: dia(9) })); // só aparelho e serviço
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/completa`), informa)); // já tem aparelho e serviço
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/alheia`), informa)); // serviço de outro técnico
  await assertSucceeds(updateDoc(doc(db, `empresas/${E}/servicos/adef`), informa));
});

test('pacote 9: só o administrador grava o horário de funcionamento (mapa com no máximo os 7 dias)', async () => {
  await semear();
  const admin = como(ADMIN);
  const semana = Object.fromEntries(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map((d) => [d, { aberto: d !== 'dom', de: '07:00', ate: '18:00' }]));
  await assertSucceeds(updateDoc(doc(admin, `empresas/${E}`), { expediente: semana }));
  await assertSucceeds(updateDoc(doc(admin, `empresas/${E}`), { expediente: { ...semana, sab: { aberto: true, de: '08:00', ate: '12:00' } } }));
  await assertFails(updateDoc(doc(admin, `empresas/${E}`), { expediente: { ...semana, feriado: { aberto: true, de: '08:00', ate: '12:00' } } }));
  await assertFails(updateDoc(doc(admin, `empresas/${E}`), { expediente: 'sempre aberto' }));
  await assertFails(updateDoc(doc(como(TEC), `empresas/${E}`), { expediente: semana }));
  await assertFails(updateDoc(doc(como(OUTRO), `empresas/${E}`), { expediente: semana }));
});

test('pacote 15: só o administrador grava atraso do técnico e a troca de técnico (campos com tipo certo)', async () => {
  await semear();
  const admin = como(ADMIN);
  await assertSucceeds(updateDoc(doc(admin, `empresas/${E}/servicos/s-tec`), { atrasoPorTecnico: true, atrasoTecnicoNome: 'Rafael Costa', atualizadoEm: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(admin, `empresas/${E}/servicos/s-tec`), { atrasoPorTecnico: false, reatribuidoDeNome: 'Rafael Costa', reatribuidoDeUid: TEC, reatribuicaoVista: false, atualizadoEm: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(admin, `empresas/${E}/servicos/s-tec`), { reatribuicaoVista: true }));
  await assertFails(updateDoc(doc(admin, `empresas/${E}/servicos/s-tec`), { atrasoPorTecnico: 'sim' }));
  await assertFails(updateDoc(doc(admin, `empresas/${E}/servicos/s-tec`), { reatribuicaoVista: 'sim' }));
  await assertFails(updateDoc(doc(como(TEC), `empresas/${E}/servicos/s-tec`), { atrasoPorTecnico: true }));
  await assertFails(updateDoc(doc(como(OUTRO), `empresas/${E}/servicos/s-tec`), { reatribuicaoVista: true }));
});

// ---------------------------------------------------------------------------------------------------------------
// PACOTE 25: links curtos (coleção linksCurtos)
// ---------------------------------------------------------------------------------------------------------------
const linkHorarios = (extra = {}) => ({ tipo: 'horarios', empresaId: E, consulta: 'e=Frio&w=5511912345678&g=2026-11-21&p=0_bo_3fff', criadoEm: serverTimestamp(), expiraEm: dia(8), ...extra });
const linkPedido = (extra = {}) => ({ tipo: 'pedido', empresaId: E, origem: 'abcdefghij', consulta: 'data=2026-11-25&hora=09:00&pedido=1&nome=Ana', criadoEm: serverTimestamp(), expiraEm: dia(30), ...extra });
async function semearLinkDeHorarios(extra = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'linksCurtos/abcdefghij'), { tipo: 'horarios', empresaId: E, consulta: 'e=Frio', criadoEm: dia(0), expiraEm: dia(8), ...extra });
  });
}

test('pacote 25: só o administrador cria o link de horários, da própria empresa, com validade limitada', async () => {
  await assertSucceeds(setDoc(doc(como(ADMIN), 'linksCurtos/k1k1k1k1k1'), linkHorarios()));
  await assertFails(setDoc(doc(anonimo(), 'linksCurtos/k2k2k2k2k2'), linkHorarios()));
  await assertFails(setDoc(doc(como(TEC), 'linksCurtos/k3k3k3k3k3'), linkHorarios()));
  await assertFails(setDoc(doc(como(OUTRO), 'linksCurtos/k4k4k4k4k4'), linkHorarios())); // de outra empresa
  await assertFails(setDoc(doc(como(ADMIN), 'linksCurtos/k5k5k5k5k5'), linkHorarios({ expiraEm: dia(40) })));
  await assertFails(setDoc(doc(como(ADMIN), 'linksCurtos/k6k6k6k6k6'), linkHorarios({ consulta: 'x'.repeat(3001) })));
  await assertFails(setDoc(doc(como(ADMIN), 'linksCurtos/k7k7k7k7k7'), linkHorarios({ campoExtra: 1 })));
  await assertFails(setDoc(doc(como(ADMIN), 'linksCurtos/k8k8k8k8k8'), linkHorarios({ criadoEm: dia(-3) })));
});

test('pacote 25: o link de horários é lido por qualquer pessoa com o código, até vencer; ninguém lista nem altera', async () => {
  await semearLinkDeHorarios();
  await assertSucceeds(getDoc(doc(anonimo(), 'linksCurtos/abcdefghij')));
  await assertFails(getDocs(collection(anonimo(), 'linksCurtos')));
  await assertFails(getDocs(collection(como(ADMIN), 'linksCurtos')));
  await assertFails(updateDoc(doc(como(ADMIN), 'linksCurtos/abcdefghij'), { consulta: 'outro' }));
  await assertFails(deleteDoc(doc(anonimo(), 'linksCurtos/abcdefghij')));
  await assertSucceeds(deleteDoc(doc(como(ADMIN), 'linksCurtos/abcdefghij')));
  await semearLinkDeHorarios({ expiraEm: dia(-1) });
  await assertFails(getDoc(doc(anonimo(), 'linksCurtos/abcdefghij'))); // venceu
});

test('pacote 25: a página do cliente cria o pedido só citando um link de horários da mesma empresa', async () => {
  await semearLinkDeHorarios();
  await assertSucceeds(setDoc(doc(anonimo(), 'linksCurtos/pedido0001'), linkPedido()));
  await assertFails(setDoc(doc(anonimo(), 'linksCurtos/pedido0002'), linkPedido({ origem: 'naoexiste1' })));
  await assertFails(setDoc(doc(anonimo(), 'linksCurtos/pedido0003'), linkPedido({ empresaId: 'emp2' }))); // empresa diferente da do link
  await assertFails(setDoc(doc(anonimo(), 'linksCurtos/pedido0004'), linkPedido({ consulta: 'x'.repeat(1501) })));
  await assertFails(setDoc(doc(anonimo(), 'linksCurtos/pedido0005'), linkPedido({ expiraEm: dia(60) })));
  await assertFails(setDoc(doc(anonimo(), 'linksCurtos/pedido0006'), linkPedido({ extra: 'x' })));
  await assertFails(setDoc(doc(anonimo(), 'linksCurtos/pedido0007'), linkPedido({ origem: 'pedido0001' }))); // origem precisa ser link de horários
});

test('pacote 25: o pedido só é lido (e apagado) pelo administrador da empresa', async () => {
  await semearLinkDeHorarios();
  await setDoc(doc(anonimo(), 'linksCurtos/pedido0001'), linkPedido());
  await assertFails(getDoc(doc(anonimo(), 'linksCurtos/pedido0001')));
  await assertFails(getDoc(doc(como(TEC), 'linksCurtos/pedido0001')));
  await assertFails(getDoc(doc(como(OUTRO), 'linksCurtos/pedido0001')));
  await assertSucceeds(getDoc(doc(como(ADMIN), 'linksCurtos/pedido0001')));
  await assertFails(updateDoc(doc(como(ADMIN), 'linksCurtos/pedido0001'), { consulta: 'x' }));
  await assertSucceeds(deleteDoc(doc(como(ADMIN), 'linksCurtos/pedido0001')));
});

// ---- Pacote 27: iniciar serviço, atraso com motivo e horários na conclusão ----
test('pacote 27: o técnico INICIA só o próprio serviço agendado, gravando apenas a hora de início', async () => {
  const db = como(TEC);
  const inicio = { iniciadoEm: Timestamp.fromMillis(Date.now() - 600000), atualizadoEm: serverTimestamp() };
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-outro`), inicio)); // serviço de outro técnico
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...inicio, status: 'cancelado' })); // nada além do início
  // (status 'concluido' junto com iniciadoEm é a CONCLUSÃO do técnico, que já era permitida e agora aceita a hora de início)
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...inicio, pago: true }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { iniciadoEm: inicio.iniciadoEm })); // sem a hora do servidor
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...inicio, atualizadoEm: new Date(2020, 0, 1) })); // hora inventada
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...inicio, iniciadoEm: Timestamp.fromMillis(Date.now() + 3 * 3600000) })); // início no futuro
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...inicio, iniciadoEm: 'agora' })); // tipo errado
  await assertSucceeds(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), inicio));
});

test('pacote 27: "Ainda estou no serviço" grava só o motivo do atraso e quanto tempo falta', async () => {
  const db = como(TEC);
  const atraso = { atrasoMotivo: 'Falta de peça', atrasoDetalhe: 'Capacitor', atrasoFalta: '30', atrasoInformadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() };
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-outro`), atraso)); // serviço de outro técnico
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...atraso, status: 'concluido' }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...atraso, valorDefinido: true }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...atraso, atrasoMotivo: '' })); // motivo é obrigatório
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...atraso, atrasoMotivo: 'x'.repeat(61) }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...atraso, atrasoDetalhe: 'x'.repeat(301) }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...atraso, atrasoFalta: '7' }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...atraso, atrasoInformadoEm: new Date(2020, 0, 1) })); // hora inventada
  await assertSucceeds(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), atraso));
});

test('pacote 27: o técnico conclui informando o início e o motivo do atraso (início nunca depois da conclusão)', async () => {
  const db = como(TEC);
  const fim = Timestamp.fromMillis(Date.now() - 60000);
  const base = { ...conclusao(), dataConclusao: fim };
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...base, iniciadoEm: Timestamp.fromMillis(Date.now() + 600000) })); // início depois da conclusão
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...base, iniciadoEm: 'x' }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...base, atrasoMotivo: 'x'.repeat(61) }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...base, atrasoFalta: '30' })); // só o motivo e o detalhe vão na conclusão
  await assertSucceeds(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...base, iniciadoEm: Timestamp.fromMillis(Date.now() - 3600000), atrasoMotivo: 'Trânsito', atrasoDetalhe: 'Chuva forte' }));
});

test('pacote 27: o administrador corrige início, conclusão e motivo (tipos certos)', async () => {
  const adm = como(ADMIN);
  const ref = doc(adm, `empresas/${E}/servicos/s-tec`);
  await assertSucceeds(updateDoc(ref, { iniciadoEm: Timestamp.fromMillis(Date.now() - 7200000), atrasoMotivo: 'Falta de peça', atrasoFalta: 'mais', atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(ref, { iniciadoEm: 'ontem', atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(ref, { atrasoFalta: '7', atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(ref, { atrasoMotivo: 'x'.repeat(61), atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(ref, { campoInventado: 1, atualizadoEm: serverTimestamp() }));
});

// ---- Pacote 29: horário conferido ----
test('pacote 29: o técnico conclui informando se conferiu os horários (só booleano)', async () => {
  const db = como(TEC);
  const base = { ...conclusao(), dataConclusao: Timestamp.fromMillis(Date.now() - 60000), iniciadoEm: Timestamp.fromMillis(Date.now() - 3600000) };
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...base, horariosConferidos: 'sim' }));
  await assertFails(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...base, horariosConferidos: 1 }));
  await assertSucceeds(updateDoc(doc(db, `empresas/${E}/servicos/s-tec`), { ...base, horariosConferidos: false }));
});

test('pacote 29: o administrador grava horariosConferidos (booleano) ao corrigir horários', async () => {
  const adm = como(ADMIN);
  const ref = doc(adm, `empresas/${E}/servicos/s-tec`);
  await assertFails(updateDoc(ref, { horariosConferidos: 'sim', atualizadoEm: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { horariosConferidos: true, atualizadoEm: serverTimestamp() }));
});

// ---- Pacote 30: link curto do mapa ----
const linkMapa = (extra = {}) => ({ tipo: 'mapa', empresaId: E, consulta: 'Rua A, 1, Brasil', criadoEm: serverTimestamp(), expiraEm: dia(30), ...extra });

test('pacote 30: só o administrador cria o link curto do mapa, da própria empresa, com validade limitada', async () => {
  await assertSucceeds(setDoc(doc(como(ADMIN), 'linksCurtos/mapa000001'), linkMapa()));
  await assertFails(setDoc(doc(anonimo(), 'linksCurtos/mapa000002'), linkMapa()));
  await assertFails(setDoc(doc(como(TEC), 'linksCurtos/mapa000003'), linkMapa()));
  await assertFails(setDoc(doc(como(OUTRO), 'linksCurtos/mapa000004'), linkMapa())); // de outra empresa
  await assertFails(setDoc(doc(como(ADMIN), 'linksCurtos/mapa000005'), linkMapa({ expiraEm: dia(40) })));
  await assertFails(setDoc(doc(como(ADMIN), 'linksCurtos/mapa000006'), linkMapa({ consulta: 'x'.repeat(601) })));
  await assertFails(setDoc(doc(como(ADMIN), 'linksCurtos/mapa000007'), linkMapa({ origem: 'abcdefghij' }))); // campo que não existe no mapa
  await assertFails(setDoc(doc(como(ADMIN), 'linksCurtos/mapa000008'), linkMapa({ criadoEm: dia(-3) })));
});

test('pacote 30: o link curto do mapa é lido por quem tem o código, até vencer; ninguém lista nem altera', async () => {
  await setDoc(doc(como(ADMIN), 'linksCurtos/mapa000001'), linkMapa());
  await assertSucceeds(getDoc(doc(anonimo(), 'linksCurtos/mapa000001')));
  await assertFails(getDocs(collection(anonimo(), 'linksCurtos')));
  await assertFails(updateDoc(doc(como(ADMIN), 'linksCurtos/mapa000001'), { consulta: 'outro' }));
  await assertFails(deleteDoc(doc(anonimo(), 'linksCurtos/mapa000001')));
  await assertSucceeds(deleteDoc(doc(como(ADMIN), 'linksCurtos/mapa000001')));
});
