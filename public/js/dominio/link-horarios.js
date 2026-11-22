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
import { validarEndereco } from './validacoes.js';
import { linhaDoEndereco } from './endereco.js';

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

/**
 * Endereço do app sem "#", sem "index.html" e terminado em "/". Só o modo demonstração ("?demo=1") é mantido:
 * sem ele, quem abre o link veria "O aplicativo ainda não está configurado" (o app real precisa do Firebase).
 */
export function enderecoBaseDoApp(href) {
  const texto = String(href ?? '').replace(/#.*$/, '');
  const demonstracao = /[?&]demo=1(&|$)/.test(texto);
  const base = texto.replace(/\?.*$/, '').replace(/index\.html$/, '');
  return `${base.endsWith('/') ? base : `${base}/`}${demonstracao ? '?demo=1' : ''}`;
}

/** Nome do "não sei" na lista de serviços do cliente. */
export const SERVICO_NAO_SEI = 'Não sei ainda';
const MAXIMO_SERVICOS = 20;

/** Lista de nomes de serviço limpa: sem vazios, sem repetidos, nomes até 60 letras, no máximo 20. */
export function limparServicos(lista) {
  const nomes = [];
  for (const n of Array.isArray(lista) ? lista : []) {
    const nome = String(n ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  }
  return nomes.slice(0, MAXIMO_SERVICOS);
}

/**
 * O cliente precisa marcar pelo menos um serviço (ou "Não sei ainda"). "Não sei ainda" vale sozinho: se vier junto
 * com outros, ele sai. Só vale o que está na lista do link. Link sem lista (antigo): nada a validar.
 */
export function validarServicosDoPedido(escolhidos, oferecidos) {
  if (!oferecidos || oferecidos.length === 0) return { valido: true, erro: '', dados: [] };
  const aceitos = limparServicos([...oferecidos, SERVICO_NAO_SEI]);
  let marcados = limparServicos(escolhidos).filter((n) => aceitos.includes(n));
  if (marcados.length > 1) marcados = marcados.filter((n) => n !== SERVICO_NAO_SEI);
  if (marcados.length === 0) return { valido: false, erro: 'Marque o serviço que você precisa. Se não souber, marque "Não sei ainda".', dados: [] };
  return { valido: true, erro: '', dados: marcados };
}

/**
 * Monta o link que o cliente recebe.
 * @param {object} p
 * @param {string} p.base         endereço do app (enderecoBaseDoApp)
 * @param {string} p.empresa      nome da empresa (aparece no alto da página)
 * @param {string} p.whatsapp     WhatsApp do administrador (para onde o pedido vai), só números com 55
 * @param {string} [p.servico]    (links antigos) nome do serviço escolhido ('' = não sei ainda)
 * @param {string[]} [p.servicos] nomes dos serviços que o cliente poderá marcar na página (pacote 24)
 * @param {Array<{iso:string,horas:string[]}>} p.dias
 * @param {string} p.geradoEm     "AAAA-MM-DD"
 */
export function montarLinkDeHorarios({ base, empresa, whatsapp, servico = '', servicos = [], dias, geradoEm }) {
  return `${base}#/horarios?${consultaDoLinkDeHorarios({ empresa, whatsapp, servico, servicos, dias, geradoEm })}`;
}

/** Só a parte "e=...&w=...&g=...&p=..." do link de horários (é o que o link curto guarda no banco, pacote 25). */
export function consultaDoLinkDeHorarios({ empresa, whatsapp, servico = '', servicos = [], dias, geradoEm }) {
  const consulta = new URLSearchParams();
  consulta.set('e', empresa);
  consulta.set('w', whatsapp);
  consulta.set('g', geradoEm);
  consulta.set('p', compactarDias(dias, geradoEm));
  if (servico) consulta.set('s', servico);
  for (const nome of limparServicos(servicos)) consulta.append('ts', nome); // os serviços que o cliente poderá marcar
  return consulta.toString();
}

// -----------------------------------------------------------------------------
// Links curtos (pacote 25): "#/h/<código>" (horários) e "#/p/<código>" (pedido do cliente no app)
// -----------------------------------------------------------------------------

/** Código do link curto: 10 letras minúsculas e números. */
export function codigoDeLinkCurtoValido(codigo) {
  return /^[a-z0-9]{10}$/.test(String(codigo ?? ''));
}

/** Link curto dos horários que o cliente abre. */
export function linkCurtoDeHorarios(base, codigo) {
  return `${base}#/h/${codigo}`;
}

/** Link curto do pedido do cliente (abre o Agendar já preenchido, só para o administrador). */
export function linkCurtoDoPedido(base, codigo) {
  return `${base}#/p/${codigo}`;
}

/** Só a parte do pedido que vai depois de "#/agendar?" (é o que o link curto do pedido guarda no banco). */
export function consultaDoPedido({ data, hora, nome, whatsapp, endereco = null, referencia = '', servicos = [] }) {
  return pedidoNaConsulta(new URLSearchParams({ data, hora, pedido: '1' }), { nome, whatsapp, endereco, referencia, servicos }).toString();
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
  const servicos = limparServicos(consulta.getAll('ts'));
  const base = { valido: false, motivo: 'incompleto', empresa, whatsapp: normalizarWhatsappBR(whatsapp) || '', servico, servicos, geradoEm, dias: [] };
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

/**
 * O que o cliente informa (pacote 23): nome, WhatsApp e ENDEREÇO obrigatórios (rua, número e cidade); bairro,
 * complemento, estado e ponto de referência são opcionais. As coordenadas (lat/lng) só existem se o endereço veio da
 * localização do aparelho; o chamador as manda vazias quando o cliente mexeu na rua ou na cidade depois.
 * Devolve dados: { nome, whatsapp, endereco: {rua, numero, complemento, bairro, cidade, uf, lat, lng}, referencia }.
 */
export function validarPedidoDoCliente(entrada) {
  const { nome, whatsapp } = entrada;
  const erros = {};
  const n = String(nome ?? '').trim().replace(/\s+/g, ' ');
  if (n.length < 2) erros.nome = 'Digite o seu nome.';
  else if (n.length > 100) erros.nome = 'O nome está muito longo (máximo 100 letras).';
  const tel = String(whatsapp ?? '').trim();
  let numero = '';
  if (!tel) erros.whatsapp = 'Digite o seu WhatsApp, com DDD.';
  else {
    numero = normalizarWhatsappBR(tel) || '';
    if (!numero) erros.whatsapp = 'Número inválido. Digite com DDD, por exemplo (11) 91234-5678.';
  }
  const e = validarEndereco({
    rua: entrada.rua, numero: entrada.numero, complemento: entrada.complemento, bairro: entrada.bairro,
    cidade: entrada.cidade, uf: entrada.uf, lat: entrada.lat, lng: entrada.lng,
  });
  Object.assign(erros, e.erros);
  const referencia = String(entrada.referencia ?? '').trim().replace(/\s+/g, ' ');
  if (referencia.length > 120) erros.referencia = 'O ponto de referência está muito longo (máximo 120 letras).';
  const { rua, numero: num, complemento, bairro, cidade, uf, lat, lng } = e.dados || {};
  return {
    valido: Object.keys(erros).length === 0,
    erros,
    dados: { nome: n, whatsapp: numero, endereco: { rua, numero: num, complemento, bairro, cidade, uf, lat, lng }, referencia },
  };
}

// -----------------------------------------------------------------------------
// Mensagens e o link "Técnico: abrir no app"
// -----------------------------------------------------------------------------

/** Mensagem que o administrador manda ao cliente com o link. */
export function mensagemDoLinkDeHorarios({ empresa, link }) {
  return `Olá! Aqui é da ${empresa}. Para escolher o melhor dia e horário do seu atendimento, toque no link:\n${link}\n\nÉ rápido: você escolhe o dia e o horário e informa o seu nome.`;
}

/** Coloca no endereço (URL) o que o cliente informou: nome, WhatsApp, endereço e referência. Campos vazios ficam de fora. */
export function pedidoNaConsulta(consulta, pedido) {
  const { nome, whatsapp, endereco: e, referencia, servicos } = pedido;
  if (nome) consulta.set('nome', nome);
  if (whatsapp) consulta.set('whatsapp', whatsapp);
  if (e) {
    const campos = { rua: e.rua, num: e.numero, comp: e.complemento, bai: e.bairro, cid: e.cidade, uf: e.uf };
    for (const [chave, valor] of Object.entries(campos)) if (valor) consulta.set(chave, valor);
    if (Number.isFinite(e.lat) && Number.isFinite(e.lng)) { consulta.set('lat', String(e.lat)); consulta.set('lng', String(e.lng)); }
  }
  if (referencia) consulta.set('ref', referencia);
  for (const n of limparServicos(servicos)) consulta.append('serv', n);
  return consulta;
}

/** Endereço que abre o Agendar já preenchido com o pedido do cliente (só o administrador consegue usar). */
export function linkDoPedidoNoApp(base, dados) {
  return `${base}#/agendar?${consultaDoPedido(dados)}`;
}

/** Link do mapa com o ponto exato (só quando o endereço veio da localização). */
export function linkDoMapaDoPonto(endereco) {
  if (!Number.isFinite(endereco?.lat) || !Number.isFinite(endereco?.lng)) return '';
  return `https://www.google.com/maps?q=${endereco.lat},${endereco.lng}`;
}

/** Mensagem que o cliente manda ao administrador. */
export function mensagemDoPedido({ empresa, data, hora, nome, whatsapp = '', endereco = null, referencia = '', servico = '', servicos = [], linkApp }) {
  const linhas = [
    `Olá! Quero marcar um horário com a ${empresa}.`,
    '',
    `📅 ${formatarDiaExtenso(data)} às ${hora}`,
    `👤 ${nome}`,
  ];
  if (whatsapp) linhas.push(`📱 ${formatarTelefone(whatsapp)}`);
  const pedidos = limparServicos(servicos);
  if (pedidos.length > 0) linhas.push(`🔧 ${pedidos.join(', ')}`);
  if (endereco && linhaDoEndereco(endereco)) linhas.push(`📍 ${linhaDoEndereco(endereco)}`);
  if (referencia) linhas.push(`📌 Referência: ${referencia}`);
  if (linkDoMapaDoPonto(endereco)) linhas.push(`🗺️ ${linkDoMapaDoPonto(endereco)}`);
  if (servico && pedidos.length === 0) linhas.push(`🔧 ${servico}`);
  linhas.push('', 'Aguardo a confirmação. Obrigado!', '', '— Técnico: abrir no app', '', linkApp);
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
  const q = (chave, max) => String(consulta.get(chave) ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
  const lat = Number(consulta.get('lat'));
  const lng = Number(consulta.get('lng'));
  const temPonto = consulta.get('lat') !== null && consulta.get('lng') !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const endereco = {
    rua: q('rua', 120), numero: q('num', 15), complemento: q('comp', 60), bairro: q('bai', 80), cidade: q('cid', 80),
    uf: q('uf', 2).toUpperCase(), lat: temPonto ? lat : null, lng: temPonto ? lng : null,
  };
  const temEndereco = Boolean(endereco.rua || endereco.numero || endereco.cidade);
  return { data, hora, nome, whatsapp, endereco: temEndereco ? endereco : null, referencia: q('ref', 120), servicos: limparServicos(consulta.getAll('serv')) };
}
