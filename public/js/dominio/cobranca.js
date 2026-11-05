// =============================================================================
// COBRANÇA — mensagem de cobrança pelo WhatsApp (sem envio automático)
// =============================================================================
// O app NÃO envia nada sozinho: ele abre o WhatsApp com a mensagem pronta e o
// administrador aperta "enviar". A mensagem é editável em Configurações.
//
// Variáveis do texto:
//   {nome}     primeiro nome do cliente
//   {servico}  o serviço (vários: "Limpeza e Carga de gás")
//   {aparelho} o aparelho (vários: os aparelhos separados por vírgula)
//   {data}     dia em que o serviço foi feito
//   {valor}    valor a pagar (vários serviços: a SOMA)
//   {pix}      chave Pix cadastrada (se não houver, a linha com {pix} some)
//   {empresa}  nome da empresa
//   {lista}    um item por linha: "• Limpeza — R$ 180,00" (para quem quer detalhar)
// Variáveis desconhecidas ficam como estão (o administrador vê o erro de digitação).
// =============================================================================

import { formatarReais } from './dinheiro.js';
import { formatarDataBR } from './datas.js';

export const TONS_COBRANCA = [
  { id: 'amigavel', rotulo: 'Amigável' },
  { id: 'formal', rotulo: 'Formal' },
];

export const TOM_COBRANCA_PADRAO = 'amigavel';

/** Os dois modelos prontos. Quem edita o texto em Configurações troca o modelo salvo. */
export const MODELOS_COBRANCA = {
  amigavel:
    'Olá, {nome}! Tudo bem? Aqui é da {empresa}. '
    + 'Passando para lembrar do pagamento de {servico}, feito em {data}, no valor de {valor}.\n'
    + 'Pix: {pix}\n'
    + 'Qualquer dúvida é só me chamar. Obrigado!',
  formal:
    'Prezado(a) {nome}, consta em aberto o pagamento de {servico}, realizado em {data}, no valor de {valor}.\n'
    + 'Chave Pix: {pix}\n'
    + 'Agradecemos a atenção. {empresa}',
};

export const COBRANCA_MAX_LETRAS = 600;
export const PIX_MAX_LETRAS = 100;

/** Texto do modelo da empresa (ou o padrão do tom escolhido). */
export function modeloDaEmpresa(empresa) {
  const texto = String(empresa?.mensagemCobranca ?? '').trim();
  if (texto) return texto;
  return MODELOS_COBRANCA[empresa?.tomCobranca] || MODELOS_COBRANCA[TOM_COBRANCA_PADRAO];
}

/** Só os serviços que dá para cobrar: concluído, não pago e com valor maior que zero. */
export function linhasCobraveis(linhas, valores) {
  return linhas.filter((l) => l.status === 'concluido' && l.pago !== true && (valores[l.id]?.valorCentavos || 0) > 0);
}

function juntar(nomes) {
  const unicos = [...new Set(nomes.filter(Boolean))];
  if (unicos.length <= 1) return unicos[0] || '';
  return `${unicos.slice(0, -1).join(', ')} e ${unicos[unicos.length - 1]}`;
}

/**
 * Monta a mensagem de cobrança.
 * @param {string} modelo  texto com variáveis
 * @param {{ nome:string, empresa:string, pix:string, itens:{servico:string, aparelho?:string, data:Date, centavos:number}[] }} dados
 */
export function montarCobranca(modelo, { nome, empresa, pix, itens }) {
  const total = itens.reduce((t, i) => t + (i.centavos || 0), 0);
  const datas = itens.map((i) => i.data).filter(Boolean).sort((a, b) => a - b);
  const data = datas.length
    ? (formatarDataBR(datas[0]) === formatarDataBR(datas[datas.length - 1])
      ? formatarDataBR(datas[0])
      : `${formatarDataBR(datas[0])} a ${formatarDataBR(datas[datas.length - 1])}`)
    : '';
  const valores = {
    nome: nome ?? '',
    empresa: empresa ?? '',
    servico: juntar(itens.map((i) => i.servico)),
    aparelho: [...new Set(itens.map((i) => i.aparelho).filter(Boolean))].join(', '),
    data,
    valor: formatarReais(total),
    pix: String(pix ?? '').trim(),
    lista: itens.map((i) => `• ${i.servico}${i.aparelho ? ` (${i.aparelho})` : ''} — ${formatarReais(i.centavos)}`).join('\n'),
  };
  // Sem chave Pix cadastrada: a linha que fala dela some (não sai "Pix: " vazio).
  const linhas = String(modelo ?? '').split('\n').filter((l) => valores.pix || !l.includes('{pix}'));
  return linhas.join('\n').replace(/\{(\w+)\}/g, (inteiro, chave) =>
    (Object.prototype.hasOwnProperty.call(valores, chave) ? valores[chave] : inteiro));
}
