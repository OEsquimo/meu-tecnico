// =============================================================================
// AVISO AO CLIENTE — mensagem de WhatsApp sobre agendamento, cancelamento e reagendamento
// =============================================================================
// O app NÃO envia nada sozinho: abre o WhatsApp com a mensagem pronta e o
// administrador aperta "enviar". Os 3 textos são editáveis em Configurações.
// O endereço do cliente NUNCA entra na mensagem.
//
// Variáveis do texto:
//   {nome}     primeiro nome do cliente
//   {servico}  os serviços (vários: "Limpeza e Carga de gás")
//   {data}     dia por extenso ("Segunda-feira, 16 de novembro")
//   {hora}     hora do atendimento ("07:00")
//   {empresa}  nome da empresa
// Variáveis desconhecidas ficam como estão (o administrador vê o erro de digitação).
// =============================================================================

import { formatarDiaExtenso, formatarHora } from './datas.js';

export const TIPOS_DE_AVISO = ['agendado', 'cancelado', 'reagendado'];
export const AVISO_MAX_LETRAS = 600;

/** Nome do campo da empresa que guarda o texto de cada tipo de aviso. */
export const CAMPO_DO_AVISO = {
  agendado: 'avisoAgendado',
  cancelado: 'avisoCancelado',
  reagendado: 'avisoReagendado',
};

export const MODELOS_DE_AVISO = {
  agendado: 'Olá, {nome}! Seu atendimento ({servico}) está agendado para {data} às {hora}. Qualquer dúvida, é só responder esta mensagem. {empresa}',
  cancelado: 'Olá, {nome}! Precisamos cancelar o atendimento ({servico}) que estava marcado para {data} às {hora}. Em breve entramos em contato para remarcar. {empresa}',
  reagendado: 'Olá, {nome}! Seu atendimento ({servico}) foi remarcado para {data} às {hora}. Qualquer dúvida, é só responder esta mensagem. {empresa}',
};

export const TITULOS_DE_AVISO = {
  agendado: 'Avisar o cliente do agendamento?',
  cancelado: 'Avisar o cliente do cancelamento?',
  reagendado: 'Avisar o cliente da nova data?',
};

/** O texto que a empresa salvou para o tipo; sem texto salvo, o modelo pronto. */
export function modeloDoAviso(empresa, tipo) {
  const salvo = String(empresa?.[CAMPO_DO_AVISO[tipo]] ?? '').trim();
  return salvo || MODELOS_DE_AVISO[tipo];
}

/** "Limpeza", "Limpeza e Carga de gás", "Limpeza, Carga de gás e Troca de filtro". Repetidos saem. */
export function juntarServicos(nomes) {
  const lista = [...new Set((nomes || []).map((n) => String(n || '').trim()).filter(Boolean))];
  if (lista.length <= 1) return lista[0] || '';
  return `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`;
}

/** Monta o texto do aviso. dataHora é um Date. Sem serviço, os parênteses vazios somem. */
export function montarAviso(modelo, { nome, servicos, dataHora, empresa }) {
  const valores = {
    nome: String(nome ?? ''),
    servico: Array.isArray(servicos) ? juntarServicos(servicos) : String(servicos ?? ''),
    data: dataHora ? formatarDiaExtenso(dataHora) : '',
    hora: dataHora ? formatarHora(dataHora) : '',
    empresa: String(empresa ?? ''),
  };
  return String(modelo ?? '')
    .replace(/\{(\w+)\}/g, (inteiro, chave) => (Object.prototype.hasOwnProperty.call(valores, chave) ? valores[chave] : inteiro))
    .replace(/\s*\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
