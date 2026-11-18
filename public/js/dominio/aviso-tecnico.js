// =============================================================================
// AVISO AO TÉCNICO — mensagem de WhatsApp (texto fixo, não editável)
// =============================================================================
// Uma mensagem por técnico e por visita, só com os dados dele. Linha cujo dado não existe some.
// O telefone vai escrito simples (o WhatsApp não transforma "tel:" em link); o WhatsApp do cliente vai como link.
// No cancelamento NÃO vai o link do app (o serviço deixou de existir na agenda do técnico).
// =============================================================================

import { formatarDiaExtenso, formatarHora } from './datas.js';
import { normalizarWhatsappBR, formatarTelefone } from './telefone.js';
import { servicosParaAviso } from './aviso-cliente.js';

/** Link simples para conversar com o número (sem texto pronto), ou '' se o número não vale. */
export function linkConversaWhatsapp(telefone) {
  const numero = normalizarWhatsappBR(telefone);
  return numero ? `https://wa.me/${numero}` : '';
}

const dia = (d) => (d ? formatarDiaExtenso(d) : '');
const hora = (d) => (d ? formatarHora(d) : '');

/**
 * @param {'agendado'|'cancelado'|'reagendado'} tipo
 * @param {object} d  { tecnico, cliente, dataHora, anterior, endereco, whatsappCliente, telefoneCliente, linkApp, servicos }
 */
export function montarAvisoTecnico(tipo, d) {
  const primeiro = String(d.tecnico ?? '').trim().split(/\s+/)[0] || '';
  const whats = linkConversaWhatsapp(d.whatsappCliente);
  const tel = d.telefoneCliente ? (normalizarWhatsappBR(d.telefoneCliente) ? formatarTelefone(d.telefoneCliente) : String(d.telefoneCliente)) : '';
  const linhas = [];
  const add = (texto, valor) => { if (String(valor ?? '').trim() !== '') linhas.push(`${texto}${valor}`); };
  linhas.push(primeiro ? `Olá, ${primeiro}!` : 'Olá!');

  if (tipo === 'cancelado') {
    linhas.push('Um serviço seu foi cancelado.', '');
    add('👤 Cliente: ', d.cliente);
    add('📅 Data: ', dia(d.dataHora));
    add('🕒 Horário: ', hora(d.dataHora));
    add('🔧 Serviços: ', servicosParaAviso(d.servicos));
    return linhas.join('\n');
  }

  linhas.push(tipo === 'reagendado' ? 'Um serviço seu foi reagendado.' : 'Você tem um novo serviço agendado.', '');
  add('👤 Cliente: ', d.cliente);
  if (tipo === 'reagendado') {
    add('📅 Data anterior: ', dia(d.anterior));
    add('🕒 Horário anterior: ', hora(d.anterior));
    add('📅 Nova data: ', dia(d.dataHora));
    add('🕒 Novo horário: ', hora(d.dataHora));
  } else {
    add('📅 Data: ', dia(d.dataHora));
    add('🕒 Horário: ', hora(d.dataHora));
  }
  add('📍 Endereço: ', d.endereco);
  add('📱 WhatsApp do cliente: ', whats);
  add('📞 Telefone: ', tel);
  if (d.linkApp) linhas.push('', `👉 Ver os serviços e todos os detalhes no app: ${d.linkApp}`);
  linhas.push('', 'Bom trabalho!');
  return linhas.join('\n');
}
