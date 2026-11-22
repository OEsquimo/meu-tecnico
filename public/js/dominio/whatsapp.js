// =============================================================================
// WHATSAPP — monta a mensagem de lembrete e o link que abre o aplicativo
// =============================================================================
// O app NÃO envia nada sozinho: ele abre o WhatsApp com a mensagem pronta e o
// técnico aperta "enviar" (regra de negócio definida pelo dono do projeto).
// =============================================================================

import { normalizarWhatsappBR } from './telefone.js';

/**
 * Troca as variáveis do modelo pelos dados reais.
 * Variáveis aceitas: {nome} {empresa} {servico} {aparelho}
 * Variáveis desconhecidas são mantidas como estão (o técnico vê o erro de digitação).
 */
export function montarMensagem(modelo, dados) {
  const valores = {
    nome: dados.nome ?? '',
    empresa: dados.empresa ?? '',
    servico: String(dados.servico ?? '').toLowerCase(),
    aparelho: dados.aparelho ?? '',
  };
  return String(modelo ?? '').replace(/\{(\w+)\}/g, (inteiro, chave) =>
    Object.prototype.hasOwnProperty.call(valores, chave) ? valores[chave] : inteiro,
  );
}

/** Link do WhatsApp (funciona no Android com o app instalado ou no navegador). */
export function linkWhatsapp(numeroInternacional, texto) {
  return `https://wa.me/${numeroInternacional}?text=${encodeURIComponent(texto)}`;
}

/**
 * Atalho: recebe o telefone como o cliente foi cadastrado e devolve o link,
 * ou null se o telefone for inválido (a tela mostra um aviso claro).
 */
export function linkWhatsappDoCliente(telefone, texto) {
  const numero = normalizarWhatsappBR(telefone);
  return numero ? linkWhatsapp(numero, texto) : null;
}
