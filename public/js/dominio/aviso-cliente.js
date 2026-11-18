// =============================================================================
// AVISO AO CLIENTE — mensagem de WhatsApp sobre agendamento, cancelamento e reagendamento
// =============================================================================
// O app NÃO envia nada sozinho: abre o WhatsApp com a mensagem pronta e o
// administrador aperta "enviar". Os 3 textos são editáveis em Configurações.
// Linha cujas variáveis ficaram TODAS vazias some (ex.: sem técnico, some a linha do técnico).
//
// Variáveis do texto:
//   {nome}     primeiro nome do cliente
//   {servico}  os serviços (até 3 nomes diferentes; mais que isso fica vazio e a linha some)
//   {data}     dia por extenso ("Segunda-feira, 16 de novembro")
//   {hora}     hora do atendimento ("07:00")
//   {empresa}  nome da empresa
//   {tecnico}  nome(s) do(s) técnico(s)
//   {endereco} local do atendimento
//   {link}     link para escolher outro dia e hora (só no cancelamento, quando existir)
// Variáveis desconhecidas ficam como estão (o administrador vê o erro de digitação).
// =============================================================================

import { formatarDiaExtenso, formatarHora } from './datas.js';

export const TIPOS_DE_AVISO = ['agendado', 'cancelado', 'reagendado'];
export const AVISO_MAX_LETRAS = 600;
export const MAX_SERVICOS_NO_AVISO = 3;

/** Nome do campo da empresa que guarda o texto de cada tipo de aviso. */
export const CAMPO_DO_AVISO = {
  agendado: 'avisoAgendado',
  cancelado: 'avisoCancelado',
  reagendado: 'avisoReagendado',
};

export const MODELOS_DE_AVISO = {
  agendado: 'Olá, {nome}!\nSeu agendamento foi confirmado! ✅\n\n📅 Data: {data}\n🕒 Horário: {hora}\n🔧 Serviços: {servico}\n👨‍🔧 Técnico: {tecnico}\n📍 Endereço: {endereco}\n\nAgradecemos pela preferência!\n{empresa}',
  cancelado: 'Olá, {nome}!\nInformamos que seu agendamento foi cancelado.\n\n📅 Data: {data}\n🕒 Horário: {hora}\n🔧 Serviços: {servico}\n\nPara escolher outro dia e horário, acesse: {link}\n\n{empresa}',
  reagendado: 'Olá, {nome}!\nSeu serviço foi reagendado.\n\n📅 Nova data: {data}\n🕒 Novo horário: {hora}\n🔧 Serviços: {servico}\n👨‍🔧 Técnico: {tecnico}\n📍 Endereço: {endereco}\n\nAgradecemos pela compreensão!\n{empresa}',
};

/** Modelos do pacote 19 (uma linha só): quem nunca editou o texto passa a usar o novo. */
const MODELOS_ANTIGOS = [
  'Olá, {nome}! Seu atendimento ({servico}) está agendado para {data} às {hora}. Qualquer dúvida, é só responder esta mensagem. {empresa}',
  'Olá, {nome}! Precisamos cancelar o atendimento ({servico}) que estava marcado para {data} às {hora}. Em breve entramos em contato para remarcar. {empresa}',
  'Olá, {nome}! Seu atendimento ({servico}) foi remarcado para {data} às {hora}. Qualquer dúvida, é só responder esta mensagem. {empresa}',
];

export const TITULOS_DE_AVISO = {
  agendado: 'Avisar sobre o agendamento',
  cancelado: 'Avisar sobre o cancelamento',
  reagendado: 'Avisar sobre a nova data',
};

/** O texto que a empresa salvou para o tipo; sem texto salvo (ou com o modelo antigo), o modelo pronto. */
export function modeloDoAviso(empresa, tipo) {
  const salvo = String(empresa?.[CAMPO_DO_AVISO[tipo]] ?? '').trim();
  if (!salvo || MODELOS_ANTIGOS.includes(salvo)) return MODELOS_DE_AVISO[tipo];
  return salvo;
}

/** Nomes sem repetir e sem vazios. */
export function nomesDistintos(nomes) {
  return [...new Set((nomes || []).map((n) => String(n || '').trim()).filter(Boolean))];
}

/** "Limpeza", "Limpeza e Carga de gás", "Limpeza, Carga de gás e Troca de filtro". Repetidos saem. */
export function juntarServicos(nomes) {
  const lista = nomesDistintos(nomes);
  if (lista.length <= 1) return lista[0] || '';
  return `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`;
}

/** Até 3 nomes diferentes: lista; mais que isso: '' (a mensagem fica genérica). */
export function servicosParaAviso(nomes) {
  const lista = nomesDistintos(nomes);
  return lista.length > MAX_SERVICOS_NO_AVISO ? '' : juntarServicos(lista);
}

/**
 * Preenche as variáveis em um texto. Linha que tinha variável e ficou toda vazia some;
 * "()" vazio some; mais de uma linha em branco seguida vira uma só.
 */
export function preencherModelo(modelo, valores) {
  const linhas = String(modelo ?? '').split('\n').map((linha) => {
    const chaves = [...linha.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((c) => Object.prototype.hasOwnProperty.call(valores, c));
    if (chaves.length > 0 && chaves.every((c) => String(valores[c] ?? '').trim() === '')) return null;
    return linha.replace(/\{(\w+)\}/g, (inteiro, chave) => (Object.prototype.hasOwnProperty.call(valores, chave) ? valores[chave] : inteiro));
  }).filter((l) => l !== null);
  return linhas.join('\n')
    .replace(/[ \t]*\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Monta o texto do aviso. dataHora é um Date. */
export function montarAviso(modelo, { nome, servicos, dataHora, empresa, tecnico = '', endereco = '', link = '' }) {
  return preencherModelo(modelo, {
    nome: String(nome ?? ''),
    servico: Array.isArray(servicos) ? servicosParaAviso(servicos) : String(servicos ?? ''),
    data: dataHora ? formatarDiaExtenso(dataHora) : '',
    hora: dataHora ? formatarHora(dataHora) : '',
    empresa: String(empresa ?? ''),
    tecnico: Array.isArray(tecnico) ? juntarServicos(tecnico) : String(tecnico ?? ''),
    endereco: String(endereco ?? ''),
    link: String(link ?? ''),
  });
}
