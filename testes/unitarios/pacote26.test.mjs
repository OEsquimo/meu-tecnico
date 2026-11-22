// =============================================================================
// PACOTE 26: mensagem de retorno com {tempo} e {data}; backup com os campos novos
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tempoDesde, modeloDaMensagemDeRetorno } from '../../public/js/dominio/retornos.js';
import { montarMensagem } from '../../public/js/dominio/whatsapp.js';
import { MENSAGEM_WHATSAPP_PADRAO, MENSAGEM_WHATSAPP_ANTIGA } from '../../public/js/nucleo/constantes.js';
import { CAMPOS_PERMITIDOS, montarBackup, lerBackup, serializarBackup } from '../../public/js/dominio/backup.js';

test('tempoDesde: dias, meses, anos', () => {
  assert.equal(tempoDesde('2026-11-20', '2026-11-20'), '0 dias');
  assert.equal(tempoDesde('2026-11-19', '2026-11-20'), '1 dia');
  assert.equal(tempoDesde('2026-11-01', '2026-11-20'), '19 dias');
  assert.equal(tempoDesde('2026-10-20', '2026-11-20'), '1 mês');
  assert.equal(tempoDesde('2026-10-21', '2026-11-20'), '30 dias'); // ainda não completou 1 mês
  assert.equal(tempoDesde('2026-05-20', '2026-11-20'), '6 meses');
  assert.equal(tempoDesde('2026-05-21', '2026-11-20'), '5 meses');
  assert.equal(tempoDesde('2025-11-20', '2026-11-20'), '1 ano');
  assert.equal(tempoDesde('2025-09-20', '2026-11-20'), '1 ano e 2 meses');
  assert.equal(tempoDesde('2025-10-20', '2026-11-20'), '1 ano e 1 mês');
  assert.equal(tempoDesde('2024-11-20', '2026-11-20'), '2 anos');
  assert.equal(tempoDesde('', '2026-11-20'), 'algum tempo');
  assert.equal(tempoDesde(null, '2026-11-20'), 'algum tempo');
});

test('montarMensagem troca {tempo} e {data}; variável desconhecida fica como está', () => {
  const texto = montarMensagem('Faz {tempo} ({data}) da {servico} do {aparelho}. {xyz}', { tempo: '6 meses', data: '20/05/2026', servico: 'Limpeza', aparelho: 'Sala' });
  assert.equal(texto, 'Faz 6 meses (20/05/2026) da limpeza do Sala. {xyz}');
  assert.equal(montarMensagem('Olá {tempo}', {}), 'Olá ');
});

test('a mensagem padrão nova diz há quanto tempo foi o último serviço', () => {
  const texto = montarMensagem(MENSAGEM_WHATSAPP_PADRAO, { nome: 'Maria', empresa: 'Frio Certo', servico: 'Limpeza', aparelho: 'Sala', tempo: '6 meses', data: '20/05/2026' });
  assert.match(texto, /^Olá, Maria! Tudo bem\? Aqui é da Frio Certo\. Já faz 6 meses da última limpeza do seu ar-condicionado \(Sala\)\./);
  assert.doesNotMatch(texto, /\{/);
});

test('quem nunca editou a mensagem (ainda tem o padrão antigo) passa a usar o novo; quem editou mantém o texto', () => {
  assert.equal(modeloDaMensagemDeRetorno({ mensagemWhatsapp: MENSAGEM_WHATSAPP_ANTIGA }), MENSAGEM_WHATSAPP_PADRAO);
  assert.equal(modeloDaMensagemDeRetorno({ mensagemWhatsapp: `${MENSAGEM_WHATSAPP_ANTIGA}  ` }), MENSAGEM_WHATSAPP_PADRAO);
  assert.equal(modeloDaMensagemDeRetorno({}), MENSAGEM_WHATSAPP_PADRAO);
  assert.equal(modeloDaMensagemDeRetorno(null), MENSAGEM_WHATSAPP_PADRAO);
  assert.equal(modeloDaMensagemDeRetorno({ mensagemWhatsapp: '' }), MENSAGEM_WHATSAPP_PADRAO);
  const minha = 'Oi {nome}, bora limpar? {aparelho}';
  assert.equal(modeloDaMensagemDeRetorno({ mensagemWhatsapp: minha }), minha);
  assert.equal(modeloDaMensagemDeRetorno({ mensagemWhatsapp: 'Olá' }), 'Olá'); // mesmo curta, é dela
});

// Os campos do backup precisam ser exatamente os que o firestore.rules aceita em cada coleção: se um pacote criar campo
// novo e esquecer do backup, este teste avisa.
function camposDasRegras(trechoInicial) {
  const regras = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const i = regras.indexOf(trechoInicial);
  assert.ok(i >= 0, `trecho não achado nas regras: ${trechoInicial}`);
  const linha = regras.slice(i, regras.indexOf('\n', i));
  return [...linha.matchAll(/'([A-Za-z0-9]+)'/g)].map((m) => m[1]);
}

test('backup: os campos de serviços, clientes, aparelhos, tipos e valores são os mesmos das regras do Firestore', () => {
  const regrasServicos = camposDasRegras("return d.keys().hasOnly(['clienteId', 'clienteNome'");
  assert.deepEqual([...CAMPOS_PERMITIDOS.servicos].sort(), [...regrasServicos].sort());
  assert.deepEqual([...CAMPOS_PERMITIDOS.clientes].sort(), [...camposDasRegras("return d.keys().hasOnly(['nome', 'whatsapp', 'observacoes'")].sort());
  assert.deepEqual([...CAMPOS_PERMITIDOS.aparelhos].sort(), [...camposDasRegras("return d.keys().hasOnly(['clienteId', 'enderecoId', 'tipo'")].sort());
  assert.deepEqual([...CAMPOS_PERMITIDOS.valores].sort(), [...camposDasRegras("return d.keys().hasOnly(['valorCentavos', 'baseCentavos'")].sort());
});

test('backup: guarda os campos novos do serviço (atraso, troca de técnico) e as configurações da empresa', () => {
  const dados = {
    empresa: { nome: 'Frio', diasAvisoRetorno: 15, mensagemWhatsapp: 'x', avisoAgendado: 'Agendado!', expediente: { seg: { ativo: true, de: '08:00', ate: '17:00' } }, almoco: { ativo: true, de: '12:00', ate: '13:00' }, limiteHorasDia: 8, adminAtende: false, permiteTecnicoCliente: true },
    servicos: [{ id: 's1', clienteId: 'c1', status: 'agendado', atrasoPorTecnico: true, atrasoTecnicoNome: 'Ana', reatribuidoDeNome: 'Bruno', reatribuidoDeUid: 'u2', reatribuicaoVista: false }],
  };
  const lido = lerBackup(serializarBackup(montarBackup(dados)));
  assert.ok(lido.ok, lido.erro);
  const s = lido.backup.colecoes.servicos[0];
  assert.equal(s.atrasoPorTecnico, true);
  assert.equal(s.atrasoTecnicoNome, 'Ana');
  assert.equal(s.reatribuidoDeNome, 'Bruno');
  assert.equal(s.reatribuidoDeUid, 'u2');
  assert.equal(s.reatribuicaoVista, false);
  const e = lido.backup.empresa;
  assert.equal(e.avisoAgendado, 'Agendado!');
  assert.equal(e.limiteHorasDia, 8);
  assert.equal(e.adminAtende, false);
  assert.equal(e.permiteTecnicoCliente, true);
  assert.deepEqual(e.expediente, { seg: { ativo: true, de: '08:00', ate: '17:00' } });
  assert.equal(e.almoco.de, '12:00');
  // campo que a empresa não tem não aparece (nada de "undefined")
  const sem = montarBackup({ empresa: { nome: 'Frio', diasAvisoRetorno: 15, mensagemWhatsapp: 'x' } });
  assert.equal('expediente' in sem.empresa, false);
});
