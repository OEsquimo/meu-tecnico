// =============================================================================
// TESTES UNITÁRIOS DO DOMÍNIO (regras puras). Rodar: node --test testes/unitarios
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { reaisParaCentavos, formatarReais, centavosParaCampo } from '../../public/js/dominio/dinheiro.js';
import { normalizarWhatsappBR, formatarTelefone, mascararTelefoneDigitando } from '../../public/js/dominio/telefone.js';
import { paraISO, somarDias, somarMeses, diasEntre, ehISOValido, ehHoraValida } from '../../public/js/dominio/datas.js';
import { calcularDataRetorno, calcularGarantiaAte, classificarRetorno, separarRetornos, adiarRetorno } from '../../public/js/dominio/retornos.js';
import { camposDeConclusao, estaAtrasado, seloDoServico } from '../../public/js/dominio/servicos.js';
import { montarMensagem, linkWhatsapp } from '../../public/js/dominio/whatsapp.js';
import { situacaoConta, limiteEfetivo, podeCadastrarCliente, temFinanceiroCompleto, textoLimite } from '../../public/js/dominio/planos.js';
import { resumir, periodoDe, serieDoPeriodo } from '../../public/js/dominio/financeiro.js';
import { validarLogin, validarCriarConta, validarConclusao, validarFuncionario, validarPlano, validarRegrasGlobais } from '../../public/js/dominio/validacoes.js';
import { gradeDoMes, agruparPorDia } from '../../public/js/dominio/agenda.js';
import { html, esc } from '../../public/js/nucleo/ui-texto.js';
import { GARANTIA_DIAS, LIMITE_ILIMITADO } from '../../public/js/nucleo/constantes.js';

test('dinheiro: texto vira centavos inteiros', () => {
  assert.equal(reaisParaCentavos('150'), 15000);
  assert.equal(reaisParaCentavos('150,5'), 15050);
  assert.equal(reaisParaCentavos('1.234,56'), 123456);
  assert.equal(reaisParaCentavos('R$ 80'), 8000);
  assert.equal(reaisParaCentavos('1.234'), 123400);
  assert.equal(reaisParaCentavos('abc'), null);
  assert.equal(reaisParaCentavos(''), null);
  assert.equal(reaisParaCentavos('-5'), null);
  assert.equal(reaisParaCentavos('10,999'), null);
  assert.equal(centavosParaCampo(15050), '150,50');
  assert.match(formatarReais(123456), /1\.234,56/);
});

test('telefone: normaliza e valida números brasileiros', () => {
  assert.equal(normalizarWhatsappBR('(11) 91234-5678'), '5511912345678');
  assert.equal(normalizarWhatsappBR('+55 11 91234-5678'), '5511912345678');
  assert.equal(normalizarWhatsappBR('11 3456-7890'), '551134567890');
  assert.equal(normalizarWhatsappBR('11 81234-5678'), null); // celular precisa começar com 9
  assert.equal(normalizarWhatsappBR('123'), null);
  assert.equal(normalizarWhatsappBR('05 91234-5678'), null); // DDD inválido
  assert.equal(formatarTelefone('5511912345678'), '(11) 91234-5678');
  assert.equal(mascararTelefoneDigitando('11912345678'), '(11) 91234-5678');
});

test('datas: aritmética em dias e meses', () => {
  assert.equal(somarDias('2026-01-30', 3), '2026-02-02');
  assert.equal(somarMeses('2026-01-31', 1), '2026-02-28'); // não estoura para março
  assert.equal(somarMeses('2026-10-18', 6), '2027-04-18');
  assert.equal(diasEntre('2026-10-18', '2026-10-28'), 10);
  assert.equal(paraISO(new Date(2026, 9, 5)), '2026-10-05');
  assert.ok(ehISOValido('2026-02-28'));
  assert.ok(!ehISOValido('2026-02-30'));
  assert.ok(ehHoraValida('08:30'));
  assert.ok(!ehHoraValida('25:00'));
});

test('retornos: data, garantia e classificação', () => {
  assert.equal(calcularDataRetorno('2026-10-18', 6), '2027-04-18');
  assert.equal(calcularGarantiaAte('2026-10-18'), somarDias('2026-10-18', GARANTIA_DIAS));
  assert.deepEqual(classificarRetorno('2026-10-10', '2026-10-18', 15), { estado: 'vencido', dias: -8 });
  assert.equal(classificarRetorno('2026-10-25', '2026-10-18', 15).estado, 'proximo');
  assert.equal(classificarRetorno('2026-12-25', '2026-10-18', 15).estado, 'futuro');
  const lista = [
    { id: 'a', dataRetorno: '2026-10-25', retornoSituacao: 'pendente' },
    { id: 'b', dataRetorno: '2026-10-01', retornoSituacao: 'pendente' },
    { id: 'c', dataRetorno: '2026-12-25', retornoSituacao: 'pendente' },
    { id: 'd', dataRetorno: '2026-10-02', retornoSituacao: 'recusado' },
  ];
  const r = separarRetornos(lista, '2026-10-18', 15);
  assert.deepEqual(r.vencidos.map((x) => x.id), ['b']);
  assert.deepEqual(r.proximos.map((x) => x.id), ['a']);
  assert.equal(adiarRetorno('2026-10-01', '2026-10-18', 7), '2026-10-25'); // atrasado: conta de hoje
  assert.equal(adiarRetorno('2026-11-01', '2026-10-18', 7), '2026-11-08');
});

test('serviços: conclusão calcula retorno só quando o tipo gera retorno', () => {
  const quando = new Date(2026, 9, 18, 10, 0);
  const com = camposDeConclusao({ geraRetorno: true, retornoMeses: 6, concluidoEm: quando });
  assert.equal(com.status, 'concluido');
  assert.equal(com.dataRetorno, '2027-04-18');
  assert.equal(com.retornoSituacao, 'pendente');
  const sem = camposDeConclusao({ geraRetorno: false, retornoMeses: 6, concluidoEm: quando });
  assert.equal(sem.dataRetorno, null);
  assert.equal(sem.retornoSituacao, null);
  assert.ok(estaAtrasado({ status: 'agendado', dataAgendada: new Date(2020, 0, 1) }));
  assert.ok(!estaAtrasado({ status: 'concluido', dataAgendada: new Date(2020, 0, 1) }));
  assert.equal(seloDoServico({ status: 'cancelado' }).texto, 'Cancelado');
});

test('whatsapp: variáveis e link', () => {
  const t = montarMensagem('Oi {nome}, {servico} do {aparelho} - {empresa} {x}', { nome: 'Ana', servico: 'Limpeza', aparelho: 'Split', empresa: 'Frio' });
  assert.equal(t, 'Oi Ana, limpeza do Split - Frio {x}');
  assert.equal(linkWhatsapp('5511912345678', 'oi & tchau'), 'https://wa.me/5511912345678?text=oi%20%26%20tchau');
});

const PLANOS = {
  gratis: { limiteClientes: 10, financeiroCompleto: false },
  medio: { limiteClientes: 30, financeiroCompleto: true },
};
const REGRAS = { diasTeste: 7 };
const dia = (n) => new Date(Date.now() + n * 86400000);
const empresa = (o) => ({ planoId: 'gratis', planoAte: null, testeEstendidoAte: null, bloqueada: false, contadorClientes: 0, criadoEm: dia(-30), ...o });

test('planos: situação, limite e financeiro', () => {
  assert.equal(situacaoConta(empresa({}), REGRAS), 'gratis');
  assert.equal(situacaoConta(empresa({ criadoEm: dia(-2) }), REGRAS), 'teste');
  assert.equal(situacaoConta(empresa({ planoId: 'medio', planoAte: dia(5) }), REGRAS), 'ativa');
  assert.equal(situacaoConta(empresa({ planoId: 'medio', planoAte: dia(-5) }), REGRAS), 'vencida');
  assert.equal(situacaoConta(empresa({ bloqueada: true }), REGRAS), 'bloqueada');
  assert.equal(limiteEfetivo(empresa({ criadoEm: dia(-2) }), PLANOS, REGRAS), LIMITE_ILIMITADO); // teste libera tudo
  assert.equal(limiteEfetivo(empresa({}), PLANOS, REGRAS), 10);
  assert.equal(limiteEfetivo(empresa({ planoId: 'medio', planoAte: dia(5) }), PLANOS, REGRAS), 30);
  assert.equal(limiteEfetivo(empresa({ testeEstendidoAte: dia(3) }), PLANOS, REGRAS), LIMITE_ILIMITADO);
  assert.equal(podeCadastrarCliente(empresa({ contadorClientes: 10 }), PLANOS, REGRAS).motivo, 'limite');
  assert.equal(podeCadastrarCliente(empresa({ contadorClientes: 9 }), PLANOS, REGRAS).ok, true);
  assert.equal(podeCadastrarCliente(empresa({ planoId: 'medio', planoAte: dia(-1) }), PLANOS, REGRAS).motivo, 'vencida');
  assert.equal(podeCadastrarCliente(empresa({ bloqueada: true }), PLANOS, REGRAS).motivo, 'bloqueada');
  assert.equal(temFinanceiroCompleto(empresa({}), PLANOS, REGRAS), false);
  assert.equal(temFinanceiroCompleto(empresa({ criadoEm: dia(-1) }), PLANOS, REGRAS), true);
  assert.equal(temFinanceiroCompleto(empresa({ planoId: 'medio', planoAte: dia(5) }), PLANOS, REGRAS), true);
  assert.equal(textoLimite(LIMITE_ILIMITADO), 'Ilimitado');
});

test('financeiro: resumo, períodos e série', () => {
  const s = (id, tipo, pago, dataConclusao) => ({ id, tipoServicoNome: tipo, pago, dataConclusao });
  const lista = [s('1', 'Limpeza', true, new Date(2026, 9, 5)), s('2', 'Limpeza', false, new Date(2026, 9, 6)), s('3', 'Instalação', true, new Date(2026, 9, 20)), s('4', 'Limpeza', true, new Date(2026, 9, 21))];
  const valores = { 1: 10000, 2: 5000, 3: 30000 }; // 4 sem valor
  const r = resumir(lista, valores);
  assert.equal(r.recebidoCentavos, 40000);
  assert.equal(r.aReceberCentavos, 5000);
  assert.equal(r.semValor, 1);
  assert.equal(r.quantidade, 4);
  assert.equal(r.porTipo[0].nome, 'Instalação');
  const ref = new Date(2026, 9, 15);
  assert.equal(periodoDe('mes', ref).inicio.getDate(), 1);
  assert.equal(serieDoPeriodo(lista, valores, 'mes', ref).length, 5);
  assert.equal(serieDoPeriodo(lista, valores, 'ano', ref)[9].totalCentavos, 45000);
  assert.equal(serieDoPeriodo(lista, valores, 'hoje', ref).length, 0);
});

test('validações: mensagens por campo', () => {
  assert.ok(!validarLogin({ email: 'x', senha: '' }).valido);
  assert.ok(validarLogin({ email: 'a@b.com', senha: '123456' }).valido);
  const conta = validarCriarConta({ nome: 'Ana', email: 'a@b.com', senha: '123456', confirmarSenha: '1234567', aceitouTermos: true });
  assert.ok(conta.erros.confirmarSenha);
  assert.ok(validarCriarConta({ nome: 'Ana', email: 'a@b.com', senha: '123456', confirmarSenha: '123456' }).erros.aceitouTermos);
  const c = validarConclusao({ descricao: 'ok', valor: '', pago: 'sim' }, { exigirValor: true, geraRetorno: true });
  assert.ok(c.erros.descricao && c.erros.valor && c.erros.retornoMeses);
  const c2 = validarConclusao({ descricao: 'Limpeza feita', valor: '150,50', pago: true, retornoMeses: '6' }, { exigirValor: true, geraRetorno: true });
  assert.ok(c2.valido);
  assert.equal(c2.dados.valorCentavos, 15050);
  assert.equal(c2.dados.retornoMeses, 6);
  const t = validarConclusao({ descricao: 'Limpeza feita', pago: false }, { exigirValor: false, geraRetorno: false });
  assert.ok(t.valido && t.dados.valorCentavos === null);
  assert.equal(validarFuncionario({ nome: 'Rafael', telefone: '(11) 91234-5678' }).dados.telefone, '5511912345678');
  assert.ok(validarFuncionario({ nome: 'R', telefone: '' }).erros.telefone);
  assert.ok(validarPlano({ id: 'Prêmio!', nome: 'x', preco: '10', limiteClientes: '5' }, { novo: true }).erros.id);
  assert.equal(validarPlano({ id: 'ilim', nome: 'Ilimitado', preco: '59,90', ilimitado: true }, { novo: true }).dados.limiteClientes, 999999);
  assert.ok(validarRegrasGlobais({ diasTeste: '200' }).erros.diasTeste);
});

test('agenda: grade do mês e agrupamento por dia', () => {
  const g = gradeDoMes(2026, 9); // outubro/2026
  assert.ok(g.length % 7 === 0);
  const grupos = agruparPorDia([{ id: 1, dataAgendada: new Date(2026, 9, 5, 9) }, { id: 2, dataAgendada: new Date(2026, 9, 5, 14) }]);
  assert.equal(grupos['2026-10-05'].length, 2);
});

test('segurança de HTML: html`` escapa valores interpolados', () => {
  const malicioso = '<img src=x onerror=alert(1)>';
  assert.ok(!String(html`<p>${malicioso}</p>`).includes('<img'));
  assert.equal(esc('"&<'), '&quot;&amp;&lt;');
});
