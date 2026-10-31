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
  await assertSucceeds(setDoc(doc(db, `empresas/${E}/servicos/t1`), linhaNova()));
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
