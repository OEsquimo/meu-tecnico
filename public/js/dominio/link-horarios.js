// =============================================================================
// LINK DE HORÁRIOS — o administrador manda um link e o cliente escolhe dia e hora
// =============================================================================
// Funções puras (sem tela, sem banco), testadas em testes/unitarios/link-horarios.test.mjs.
//
// Como funciona (etapa 1, sem servidor):
//   1. O app do administrador calcula os horários livres dos próximos 14 dias (mesmas regras do
//      seletor de dia e hora: expediente, almoço, limite de horas, técnicos juntos).
//   2. Os horários vão DENTRO do endereço do link (compactados). Por isso o link vale por 7 dias
//      e não guarda nenhum dado de cliente.
//   3. O cliente abre o link, escolhe dia e hora, informa o nome (e o WhatsApp, se quiser) e toca
//      em "Pedir este horário": o WhatsApp abre com a mensagem pronta para o administrador.
//   4. A mensagem traz o botão "Técnico: abrir no app", que abre o Agendar já preenchido.
//
// Formato do endereço:  #/horarios?e=<empresa>&w=<whatsapp>&g=<dia em que foi gerado>&p=<dias>[&s=<serviço>]
//   p = dias separados por "-"; cada dia = "<dias depois de g>_<primeiro horário>_<máscara>", em base 36.
//   O primeiro horário é em minutos desde meia-noite; a máscara marca, de 30 em 30 minutos, os horários livres.
// =============================================================================

import { horariosLivresDoDia } from './disponibilidade.js';
import { horaParaMinutos, minutosParaHora, PASSO_AGENDA_MIN } from './expediente.js';
import { somarDias, hojeISO, diasEntre, ehISOValido, ehHoraValida, combinarDataHora, formatarDiaExtenso } from './datas.js';
import { normalizarWhatsappBR, formatarTelefone } from './telefone.js';

/** Quantos dias à frente o link mostra. */
export const DIAS_A_FRENTE = 14;
/** Por quantos dias o link vale (contados do dia em que foi gerado). */
export const VALIDADE_DIAS = 7;
/** Serviço "não sei ainda": o horário é reservado por 1 hora. */
export const DURACAO_SEM_SERVICO_MIN = 60;

// -----------------------------------------------------------------------------
// Horários livres que entram no link
// -----------------------------------------------------------------------------

/**
 * Horários livres dos próximos dias, com os técnicos somados (um horário vale se ALGUM técnico estiver livre).
 * @returns {Array<{ iso: string, horas: string[] }>} só dias com pelo menos um horário livre
 */
export function horariosLivresParaOLink({ expediente, tecnicos, agendados, duracaoMin = DURACAO_SEM_SERVICO_MIN, regras = null, agora = new Date(), dias = DIAS_A_FRENTE }) {
  const hoje = hojeISO(agora);
  const resultado = [];
  for (let i = 0; i < dias; i += 1) {
    const iso = somarDias(hoje, i);
    const horas = horariosLivresDoDia({ expediente, iso, duracaoMin, tecnicos, agendados, regras, agora }).map((h) => h.hora);
    if (horas.length > 0) resultado.push({ iso, horas });
  }
  return resultado;
}

// -----------------------------------------------------------------------------
// Compactar / abrir os dias dentro do link
// -----------------------------------------------------------------------------

const LETRAS = '0123456789abcdefghijklmnopqrstuvwxyz';

function paraBase36(bigint) {
  if (bigint === 0n) return '0';
  let n = bigint;
  let texto = '';
  while (n > 0n) {
    texto = LETRAS[Number(n % 36n)] + texto;
    n /= 36n;
  }
  return texto;
}

function deBase36(texto) {
  if (!/^[0-9a-z]+$/.test(texto)) return null;
  let n = 0n;
  for (const letra of texto) n = n * 36n + BigInt(LETRAS.indexOf(letra));
  return n;
}

/** Os horários de um dia viram "<primeiro>_<máscara>" (ex.: "bo_3fff"). */
function codificarHoras(horas) {
  const minutos = horas.map(horaParaMinutos).sort((a, b) => a - b);
  const primeiro = minutos[0];
  let mascara = 0n;
  for (const m of minutos) {
    const passo = (m - primeiro) / PASSO_AGENDA_MIN;
    if (Number.isInteger(passo)) mascara |= 1n << BigInt(passo);
  }
  return `${paraBase36(BigInt(primeiro))}_${paraBase36(mascara)}`;
}

function decodificarHoras(primeiroTexto, mascaraTexto) {
  const primeiro = deBase36(primeiroTexto);
  const mascara = deBase36(mascaraTexto);
  if (primeiro === null || mascara === null || primeiro >= 24n * 60n) return null;
  const horas = [];
  for (let passo = 0; passo < 96; passo += 1) {
    if ((mascara >> BigInt(passo)) & 1n) {
      const minutos = Number(primeiro) + passo * PASSO_AGENDA_MIN;
      if (minutos >= 24 * 60) return null;
      horas.push(minutosParaHora(minutos));
    }
  }
  return horas;
}

/** Junta os dias num texto curto para o endereço. `geradoEm` = dia ("AAAA-MM-DD") em que o link foi feito. */
export function compactarDias(dias, geradoEm) {
  return dias
    .filter((d) => d.horas.length > 0 && diasEntre(geradoEm, d.iso) >= 0)
    .map((d) => `${paraBase36(BigInt(diasEntre(geradoEm, d.iso)))}_${codificarHoras(d.horas)}`)
    .join('-');
}

/** Desfaz `compactarDias`. Devolve null se o texto estiver quebrado (link cortado ou mexido). */
export function abrirDias(texto, geradoEm) {
  if (!ehISOValido(geradoEm)) return null;
  const dias = [];
  for (const parte of String(texto ?? '').split('-')) {
    if (!parte) continue;
    const pedacos = parte.split('_');
    if (pedacos.length !== 3) return null;
    const depois = deBase36(pedacos[0]);
    if (depois === null || depois > 400n) return null;
    const horas = decodificarHoras(pedacos[1], pedacos[2]);
    if (!horas || horas.length === 0) return null;
    dias.push({ iso: somarDias(geradoEm, Number(depois)), horas });
  }
  return dias;
}

// -----------------------------------------------------------------------------
// O link e a leitura dele
// -----------------------------------------------------------------------------

/** Endereço do app sem "#", "?" nem "index.html", terminado em "/". */
export function enderecoBaseDoApp(href) {
  const base = String(href ?? '').replace(/#.*$/, '').replace(/\?.*$/, '').replace(/index\.html$/, '');
  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Monta o link que o cliente recebe.
 * @param {object} p
 * @param {string} p.base         endereço do app (enderecoBaseDoApp)
 * @param {string} p.empresa      nome da empresa (aparece no alto da página)
 * @param {string} p.whatsapp     WhatsApp do administrador (para onde o pedido vai), só números com 55
 * @param {string} [p.servico]    nome do serviço escolhido ('' = não sei ainda)
 * @param {Array<{iso:string,horas:string[]}>} p.dias
 * @param {string} p.geradoEm     "AAAA-MM-DD"
 */
export function montarLinkDeHorarios({ base, empresa, whatsapp, servico = '', dias, geradoEm }) {
  const consulta = new URLSearchParams();
  consulta.set('e', empresa);
  consulta.set('w', whatsapp);
  consulta.set('g', geradoEm);
  consulta.set('p', compactarDias(dias, geradoEm));
  if (servico) consulta.set('s', servico);
  return `${base}#/horarios?${consulta.toString()}`;
}

/**
 * Lê o link no lado do cliente.
 * `motivo`: 'incompleto' (link cortado/mexido), 'vencido' (passou de 7 dias) ou 'sem-horarios'
 * (nenhum horário sobrou). Em qualquer um deles `valido` é false.
 * Só devolve horários que ainda não passaram.
 */
export function lerLinkDeHorarios(consulta, agora = new Date()) {
  const empresa = String(consulta.get('e') ?? '').trim().slice(0, 100);
  const whatsapp = String(consulta.get('w') ?? '').replace(/\D/g, '');
  const geradoEm = consulta.get('g') ?? '';
  const servico = String(consulta.get('s') ?? '').trim().slice(0, 60);
  const base = { valido: false, motivo: 'incompleto', empresa, whatsapp: normalizarWhatsappBR(whatsapp) || '', servico, geradoEm, dias: [] };
  if (!empresa || !ehISOValido(geradoEm)) return base;
  const compactados = consulta.get('p');
  if (!compactados) return base; // sem horários no endereço: link cortado
  const dias = abrirDias(compactados, geradoEm);
  if (dias === null) return base;
  if (diasEntre(geradoEm, hojeISO(agora)) > VALIDADE_DIAS) return { ...base, motivo: 'vencido' };
  const vivos = dias
    .map((d) => ({ iso: d.iso, horas: d.horas.filter((h) => combinarDataHora(d.iso, h).getTime() > agora.getTime()) }))
    .filter((d) => d.horas.length > 0);
  if (vivos.length === 0) return { ...base, motivo: 'sem-horarios' };
  return { ...base, valido: true, motivo: null, dias: vivos };
}

/** "manha" (antes do meio-dia) ou "tarde". */
export function periodoDoHorario(hora) {
  return horaParaMinutos(hora) < 12 * 60 ? 'manha' : 'tarde';
}

// -----------------------------------------------------------------------------
// O que o cliente preenche
// -----------------------------------------------------------------------------

/** Nome obrigatório; WhatsApp opcional (se vier, precisa ser válido). */
export function validarPedidoDoCliente({ nome, whatsapp }) {
  const erros = {};
  const n = String(nome ?? '').trim().replace(/\s+/g, ' ');
  if (n.length < 2) erros.nome = 'Digite o seu nome.';
  else if (n.length > 100) erros.nome = 'O nome está muito longo (máximo 100 letras).';
  const tel = String(whatsapp ?? '').trim();
  let numero = '';
  if (tel) {
    numero = normalizarWhatsappBR(tel) || '';
    if (!numero) erros.whatsapp = 'Número inválido. Digite com DDD, por exemplo (11) 91234-5678.';
  }
  return { valido: Object.keys(erros).length === 0, erros, dados: { nome: n, whatsapp: numero } };
}

// -----------------------------------------------------------------------------
// Mensagens e o link "Técnico: abrir no app"
// -----------------------------------------------------------------------------

/** Mensagem que o administrador manda ao cliente com o link. */
export function mensagemDoLinkDeHorarios({ empresa, link }) {
  return `Olá! Aqui é da ${empresa}. Para escolher o melhor dia e horário do seu atendimento, toque no link:\n${link}\n\nÉ rápido: você escolhe o dia e o horário e informa o seu nome.`;
}

/** Endereço que abre o Agendar já preenchido com o pedido do cliente (só o administrador consegue usar). */
export function linkDoPedidoNoApp(base, { data, hora, nome, whatsapp }) {
  const consulta = new URLSearchParams({ data, hora, pedido: '1', nome });
  if (whatsapp) consulta.set('whatsapp', whatsapp);
  return `${base}#/agendar?${consulta.toString()}`;
}

/** Mensagem que o cliente manda ao administrador. */
export function mensagemDoPedido({ empresa, data, hora, nome, whatsapp = '', servico = '', linkApp }) {
  const linhas = [
    `Olá! Quero marcar um horário com a ${empresa}.`,
    '',
    `📅 ${formatarDiaExtenso(data)} às ${hora}`,
    `👤 ${nome}`,
  ];
  if (whatsapp) linhas.push(`📱 ${formatarTelefone(whatsapp)}`);
  if (servico) linhas.push(`🔧 ${servico}`);
  linhas.push('', 'Aguardo a confirmação. Obrigado!', '', '— Técnico: abrir no app', linkApp);
  return linhas.join('\n');
}

/**
 * Lê o pedido que veio no endereço do Agendar. Devolve null se não for um pedido de cliente ou se
 * estiver mexido (data/hora inválidas).
 */
export function lerPedidoDaConsulta(consulta) {
  if (!consulta || consulta.get('pedido') !== '1') return null;
  const data = consulta.get('data') ?? '';
  const hora = consulta.get('hora') ?? '';
  if (!ehISOValido(data) || !ehHoraValida(hora)) return null;
  const nome = String(consulta.get('nome') ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const whatsapp = normalizarWhatsappBR(consulta.get('whatsapp') ?? '') || '';
  return { data, hora, nome, whatsapp };
}
