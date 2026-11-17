// Pacote 19: aviso ao cliente por WhatsApp (agendado, cancelado, reagendado).
import test from 'node:test';
import assert from 'node:assert/strict';
import { montarAviso, modeloDoAviso, juntarServicos, MODELOS_DE_AVISO, CAMPO_DO_AVISO, TIPOS_DE_AVISO } from '../../public/js/dominio/aviso-cliente.js';
import { validarConfiguracoes } from '../../public/js/dominio/validacoes.js';
import { linkWhatsappDoCliente } from '../../public/js/dominio/whatsapp.js';

const quando = new Date(2026, 10, 16, 7, 0); // segunda, 16/11/2026 07:00

test('juntar serviços: um, dois, três e repetidos', () => {
  assert.equal(juntarServicos([]), '');
  assert.equal(juntarServicos(['Limpeza']), 'Limpeza');
  assert.equal(juntarServicos(['Limpeza', 'Carga de gás']), 'Limpeza e Carga de gás');
  assert.equal(juntarServicos(['Limpeza', 'Carga de gás', 'Troca de filtro']), 'Limpeza, Carga de gás e Troca de filtro');
  assert.equal(juntarServicos(['Limpeza', 'Limpeza', ' ', null]), 'Limpeza');
});

test('montar aviso: troca nome, serviço, dia, hora e empresa; não leva endereço', () => {
  const t = montarAviso(MODELOS_DE_AVISO.agendado, { nome: 'Maria', servicos: ['Limpeza'], dataHora: quando, empresa: 'O Esquimó' });
  assert.match(t, /Olá, Maria!/);
  assert.match(t, /Limpeza/);
  assert.match(t, /Segunda-feira, 16 de novembro às 07:00/);
  assert.match(t, /O Esquimó/);
  assert.doesNotMatch(t, /\{/);
  for (const tipo of TIPOS_DE_AVISO) {
    assert.doesNotMatch(MODELOS_DE_AVISO[tipo], /\{(endereco|rua|bairro)\}/, 'os modelos prontos não têm endereço');
  }
});

test('montar aviso: sem serviço some o parêntese vazio; variável desconhecida fica', () => {
  const t = montarAviso('Oi {nome} ({servico}) {xpto}', { nome: 'Ana', servicos: [], dataHora: quando, empresa: 'E' });
  assert.equal(t, 'Oi Ana {xpto}');
});

test('os três modelos prontos são diferentes e cada tipo tem o seu campo', () => {
  assert.equal(new Set(TIPOS_DE_AVISO.map((t) => MODELOS_DE_AVISO[t])).size, 3);
  assert.deepEqual(CAMPO_DO_AVISO, { agendado: 'avisoAgendado', cancelado: 'avisoCancelado', reagendado: 'avisoReagendado' });
  assert.match(MODELOS_DE_AVISO.cancelado, /cancelar/);
  assert.match(MODELOS_DE_AVISO.reagendado, /remarcado/);
});

test('modelo da empresa: usa o texto salvo; vazio ou ausente usa o modelo pronto', () => {
  assert.equal(modeloDoAviso({ avisoCancelado: 'Texto meu' }, 'cancelado'), 'Texto meu');
  assert.equal(modeloDoAviso({ avisoCancelado: '   ' }, 'cancelado'), MODELOS_DE_AVISO.cancelado);
  assert.equal(modeloDoAviso({}, 'agendado'), MODELOS_DE_AVISO.agendado);
  assert.equal(modeloDoAviso(null, 'reagendado'), MODELOS_DE_AVISO.reagendado);
});

test('cliente sem telefone válido: não há link (o botão não aparece)', () => {
  assert.equal(linkWhatsappDoCliente('', 'x'), null);
  assert.equal(linkWhatsappDoCliente('123', 'x'), null);
  assert.match(linkWhatsappDoCliente('(11) 91234-5678', 'Olá'), /^https:\/\/wa\.me\/5511912345678\?text=/);
});

test('configurações: valida e guarda os 3 avisos; vazio volta ao modelo; passou de 600 dá erro', () => {
  const base = { nome: 'Frio', diasAvisoRetorno: '15', mensagemWhatsapp: 'oi', permiteTecnicoCliente: false, mensagemCobranca: 'cobra' };
  const r = validarConfiguracoes({ ...base, avisoAgendado: ' Meu aviso ', avisoCancelado: '', avisoReagendado: undefined });
  assert.equal(r.valido, true);
  assert.equal(r.dados.avisoAgendado, 'Meu aviso');
  assert.equal(r.dados.avisoCancelado, MODELOS_DE_AVISO.cancelado);
  assert.equal(r.dados.avisoReagendado, MODELOS_DE_AVISO.reagendado);
  const longo = validarConfiguracoes({ ...base, avisoCancelado: 'x'.repeat(601) });
  assert.equal(longo.valido, false);
  assert.ok(longo.erros.avisoCancelado);
});
