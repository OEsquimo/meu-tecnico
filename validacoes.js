// =============================================================================
// VALIDAÇÕES — regras dos formulários, com mensagens claras em português
// =============================================================================
// Todas as funções recebem os dados digitados e devolvem:
//   { valido: boolean, erros: { campo: 'mensagem' }, dados: {...limpos...} }
// "dados" já vem normalizado (sem espaços sobrando, telefone no formato certo...).
// São funções PURAS (sem tela e sem Firebase): têm testes em testes/unitarios/.
// As regras do Firestore repetem os limites de tamanho (defesa em profundidade).
// =============================================================================

import { normalizarWhatsappBR } from './telefone.js';
import { reaisParaCentavos } from './dinheiro.js';
import { ehISOValido, ehHoraValida } from './datas.js';
import { PRAZOS_RETORNO_MESES, TIPOS_APARELHO, MAXIMO_ENDERECOS, DURACAO_PADRAO_MIN, DURACAO_MIN_LIMITE, DURACAO_MAX_LIMITE } from '../nucleo/constantes.js';
import { cepValido, somenteDigitosCEP } from './endereco.js';

const texto = (v) => String(v ?? '').trim();

function resultado(erros, dados) {
  return { valido: Object.keys(erros).length === 0, erros, dados };
}

// -----------------------------------------------------------------------------
// LOGIN E CONTA
// -----------------------------------------------------------------------------

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validarEmail(valor) {
  const email = texto(valor).toLowerCase();
  if (!email) return { erro: 'Digite o seu e-mail.', email };
  if (!REGEX_EMAIL.test(email)) return { erro: 'Este e-mail não parece certo. Exemplo: nome@email.com', email };
  return { erro: null, email };
}

export function validarLogin({ email, senha }) {
  const erros = {};
  const e = validarEmail(email);
  if (e.erro) erros.email = e.erro;
  if (!String(senha ?? '')) erros.senha = 'Digite a sua senha.';
  return resultado(erros, { email: e.email, senha: String(senha ?? '') });
}

export function validarSenhaNova(senha, confirmacao) {
  const erros = {};
  const s = String(senha ?? '');
  if (s.length < 6) erros.senha = 'A senha precisa ter pelo menos 6 caracteres.';
  else if (s.length > 100) erros.senha = 'A senha está muito longa (máximo 100 caracteres).';
  if (confirmacao !== undefined && s !== String(confirmacao ?? '')) {
    erros.confirmarSenha = 'As senhas não são iguais.';
  }
  return erros;
}

export function validarCriarConta({ nome, nomeEmpresa, email, senha, confirmarSenha, aceitouTermos }) {
  const erros = {};
  const n = texto(nome);
  if (n.length < 2) erros.nome = 'Digite o seu nome.';
  else if (n.length > 100) erros.nome = 'O nome está muito longo (máximo 100 letras).';
  const empresa = texto(nomeEmpresa) || n;
  if (empresa.length > 100) erros.nomeEmpresa = 'O nome está muito longo (máximo 100 letras).';
  const e = validarEmail(email);
  if (e.erro) erros.email = e.erro;
  Object.assign(erros, validarSenhaNova(senha, confirmarSenha));
  if (aceitouTermos !== true) erros.aceitouTermos = 'Para criar a conta, é preciso aceitar os termos de uso e a política de privacidade.';
  return resultado(erros, { nome: n, nomeEmpresa: empresa, email: e.email, senha: String(senha ?? '') });
}

export function validarAceitarConvite({ nome, email, senha, confirmarSenha, aceitouTermos }, { jaTemConta = false } = {}) {
  const erros = {};
  const e = validarEmail(email);
  if (e.erro) erros.email = e.erro;
  let n = texto(nome);
  if (!jaTemConta) {
    if (n.length < 2) erros.nome = 'Digite o seu nome.';
    Object.assign(erros, validarSenhaNova(senha, confirmarSenha));
    if (aceitouTermos !== true) erros.aceitouTermos = 'Para entrar na equipe, é preciso aceitar os termos de uso e a política de privacidade.';
  } else if (!String(senha ?? '')) {
    erros.senha = 'Digite a sua senha.';
  }
  return resultado(erros, { nome: n, email: e.email, senha: String(senha ?? '') });
}

// -----------------------------------------------------------------------------
// CLIENTE E ENDEREÇO
// -----------------------------------------------------------------------------

/** Valida um endereço. "prefixo" é usado para nomear os campos (ex.: 'end1_rua'). */
export function validarEndereco(e, prefixo = '') {
  const erros = {};
  const campo = (nome) => `${prefixo}${nome}`;
  const rua = texto(e.rua);
  const numero = texto(e.numero);
  const cidade = texto(e.cidade);
  const uf = texto(e.uf).toUpperCase();
  const cep = somenteDigitosCEP(e.cep);

  if (!rua) erros[campo('rua')] = 'Informe a rua (ou avenida).';
  else if (rua.length > 120) erros[campo('rua')] = 'A rua está muito longa.';
  if (!numero) erros[campo('numero')] = 'Informe o número da casa. Se não tiver, escreva "S/N".';
  else if (numero.length > 15) erros[campo('numero')] = 'O número está muito longo.';
  if (!cidade) erros[campo('cidade')] = 'Informe a cidade.';
  if (uf && !/^[A-Z]{2}$/.test(uf)) erros[campo('uf')] = 'O estado deve ter 2 letras (ex.: SP).';
  if (cep && !cepValido(cep)) erros[campo('cep')] = 'O CEP precisa ter 8 números. Se não souber, deixe em branco.';

  const lat = e.lat === '' || e.lat === null || e.lat === undefined ? null : Number(e.lat);
  const lng = e.lng === '' || e.lng === null || e.lng === undefined ? null : Number(e.lng);
  const coordenadasOk = (lat === null && lng === null)
    || (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180);

  return resultado(erros, {
    id: texto(e.id) || null,
    apelido: texto(e.apelido).slice(0, 40),
    cep,
    rua,
    numero,
    complemento: texto(e.complemento).slice(0, 60),
    bairro: texto(e.bairro).slice(0, 80),
    cidade,
    uf,
    lat: coordenadasOk ? lat : null,
    lng: coordenadasOk ? lng : null,
  });
}

/**
 * Valida o cadastro do cliente.
 * entrada: { nome, whatsapp, observacoes, enderecos: [{...}, {...}] }
 */
export function validarCliente({ nome, whatsapp, observacoes, enderecos }) {
  const erros = {};
  const n = texto(nome);
  if (n.length < 2) erros.nome = 'Digite o nome do cliente.';
  else if (n.length > 120) erros.nome = 'O nome está muito longo (máximo 120 letras).';

  const numero = texto(whatsapp);
  let whatsappLimpo = '';
  if (!numero) {
    erros.whatsapp = 'Informe o WhatsApp do cliente (com DDD). É por ele que você manda o lembrete de retorno.';
  } else {
    const normalizado = normalizarWhatsappBR(numero);
    if (!normalizado) erros.whatsapp = 'Número inválido. Digite com DDD, por exemplo (11) 91234-5678.';
    else whatsappLimpo = normalizado;
  }

  const obs = texto(observacoes);
  if (obs.length > 1000) erros.observacoes = 'As observações estão muito longas (máximo 1000 letras).';

  const lista = Array.isArray(enderecos) ? enderecos : [];
  if (lista.length === 0) erros.endereco = 'Informe o endereço do cliente.';
  if (lista.length > MAXIMO_ENDERECOS) erros.endereco = `Cada cliente pode ter no máximo ${MAXIMO_ENDERECOS} endereços.`;
  const enderecosLimpos = [];
  lista.forEach((end, i) => {
    const r = validarEndereco(end, `end${i + 1}_`);
    Object.assign(erros, r.erros);
    enderecosLimpos.push(r.dados);
  });

  return resultado(erros, { nome: n, whatsapp: whatsappLimpo, observacoes: obs, enderecos: enderecosLimpos });
}

// -----------------------------------------------------------------------------
// APARELHO
// -----------------------------------------------------------------------------

export function validarAparelho({ tipo, btus, nome, descricao, enderecoId }) {
  const erros = {};
  const tipoLimpo = texto(tipo);
  if (!TIPOS_APARELHO.some((t) => t.valor === tipoLimpo)) erros.tipo = 'Escolha o tipo do aparelho.';

  let btusLimpo = null;
  const btusTexto = texto(btus).replace(/\./g, '');
  if (btusTexto) {
    const n = Number(btusTexto);
    if (!Number.isInteger(n) || n < 1000 || n > 200000) erros.btus = 'BTUs inválido. Use um número entre 1.000 e 200.000 (ex.: 12000).';
    else btusLimpo = n;
  }
  const nomeLimpo = texto(nome);
  if (nomeLimpo.length > 80) erros.nome = 'O nome está muito longo (máximo 80 letras).';
  const desc = texto(descricao);
  if (desc.length > 500) erros.descricao = 'A descrição está muito longa (máximo 500 letras).';

  return resultado(erros, { tipo: tipoLimpo, btus: btusLimpo, nome: nomeLimpo, descricao: desc, enderecoId: texto(enderecoId) || null });
}

// -----------------------------------------------------------------------------
// AGENDAMENTO E CONCLUSÃO DE SERVIÇO
// -----------------------------------------------------------------------------

export function validarAgendamento({ clienteId, tipoServicoId, data, hora, enderecoId, descricao }, { hojeISO = null, exigirFuturo = false, exigirTipo = true } = {}) {
  const erros = {};
  if (!texto(clienteId)) erros.clienteId = 'Escolha o cliente.';
  if (exigirTipo && !texto(tipoServicoId)) erros.tipoServicoId = 'Escolha o tipo de serviço.';
  if (!ehISOValido(texto(data))) erros.data = 'Escolha uma data válida.';
  else if (exigirFuturo && hojeISO && texto(data) < hojeISO) erros.data = 'A data já passou. Escolha hoje ou uma data futura.';
  if (!ehHoraValida(texto(hora))) erros.hora = 'Escolha o horário (ex.: 14:30).';
  const desc = texto(descricao);
  if (desc.length > 2000) erros.descricao = 'O texto está muito longo.';
  return resultado(erros, {
    clienteId: texto(clienteId), tipoServicoId: texto(tipoServicoId), data: texto(data), hora: texto(hora),
    enderecoId: texto(enderecoId) || null, descricao: desc,
  });
}

/**
 * Valida o preenchimento do serviço feito.
 * exigirValor=true para o administrador (o técnico não informa valor).
 */
export function validarConclusao({ descricao, valor, pago, retornoMeses, aparelhoId }, { exigirValor, geraRetorno, exigirAparelho = false }) {
  const erros = {};
  if (exigirAparelho && !texto(aparelhoId)) erros.aparelhoId = 'Escolha ou cadastre o aparelho antes de concluir.';
  const desc = texto(descricao);
  if (desc.length < 3) erros.descricao = 'Descreva o que foi feito (mesmo que seja curto).';
  else if (desc.length > 2000) erros.descricao = 'A descrição está muito longa (máximo 2000 letras).';

  let valorCentavos = null;
  if (exigirValor) {
    if (texto(valor) === '') erros.valor = 'Informe o valor do serviço.';
    else {
      valorCentavos = reaisParaCentavos(texto(valor));
      if (valorCentavos === null) erros.valor = 'Valor inválido. Exemplo: 150 ou 150,50';
      else if (valorCentavos > 100000000) erros.valor = 'Esse valor é alto demais. Confira.';
    }
  }

  let meses = null;
  if (geraRetorno) {
    meses = Number(retornoMeses);
    if (!PRAZOS_RETORNO_MESES.includes(meses)) erros.retornoMeses = 'Escolha daqui a quanto tempo o cliente deve voltar.';
  }
  return resultado(erros, {
    descricao: desc, valorCentavos, pago: pago === true || pago === 'sim', retornoMeses: meses, aparelhoId: texto(aparelhoId) || null,
  });
}

// -----------------------------------------------------------------------------
// EQUIPE
// -----------------------------------------------------------------------------

export function validarFuncionario({ nome, telefone }) {
  const erros = {};
  const n = texto(nome);
  if (n.length < 2) erros.nome = 'Digite o nome do funcionário.';
  else if (n.length > 100) erros.nome = 'O nome está muito longo (máximo 100 letras).';
  const tel = texto(telefone);
  let telefoneLimpo = '';
  if (!tel) erros.telefone = 'Informe o WhatsApp do funcionário — é para onde vai o convite.';
  else {
    const normal = normalizarWhatsappBR(tel);
    if (!normal) erros.telefone = 'Número inválido. Digite com DDD, por exemplo (11) 91234-5678.';
    else telefoneLimpo = normal;
  }
  return resultado(erros, { nome: n, telefone: telefoneLimpo });
}

// -----------------------------------------------------------------------------
// ADMINISTRATIVA / CONFIGURAÇÕES
// -----------------------------------------------------------------------------

export function validarTipoServico({ nome, geraRetorno, retornoPadraoMeses, duracaoMin }) {
  const erros = {};
  const n = texto(nome);
  if (n.length < 2) erros.nome = 'Digite o nome do serviço.';
  else if (n.length > 60) erros.nome = 'O nome está muito longo (máximo 60 letras).';
  const gera = geraRetorno === true || geraRetorno === 'on' || geraRetorno === 'sim';
  let meses = 0;
  if (gera) {
    meses = Number(retornoPadraoMeses);
    if (!PRAZOS_RETORNO_MESES.includes(meses)) erros.retornoPadraoMeses = 'Escolha o prazo padrão de retorno.';
  }
  let duracao = DURACAO_PADRAO_MIN;
  if (texto(duracaoMin) !== '') {
    duracao = Number(texto(duracaoMin));
    if (!Number.isInteger(duracao) || duracao < DURACAO_MIN_LIMITE || duracao > DURACAO_MAX_LIMITE) {
      erros.duracaoMin = `Use entre ${DURACAO_MIN_LIMITE} e ${DURACAO_MAX_LIMITE} minutos.`;
    }
  }
  return resultado(erros, { nome: n, geraRetorno: gera, retornoPadraoMeses: gera ? meses : 0, duracaoMin: duracao });
}

export function validarConfiguracoes({ nome, diasAvisoRetorno, mensagemWhatsapp, permiteTecnicoCliente }) {
  const erros = {};
  const n = texto(nome);
  if (!n) erros.nome = 'Digite o nome da empresa.';
  else if (n.length > 100) erros.nome = 'O nome está muito longo (máximo 100 letras).';
  const dias = Number(texto(diasAvisoRetorno));
  if (!Number.isInteger(dias) || dias < 0 || dias > 90) erros.diasAvisoRetorno = 'Use um número de dias entre 0 e 90.';
  const msg = texto(mensagemWhatsapp);
  if (!msg) erros.mensagemWhatsapp = 'Escreva a mensagem do lembrete.';
  else if (msg.length > 600) erros.mensagemWhatsapp = 'A mensagem está muito longa (máximo 600 letras).';
  return resultado(erros, {
    nome: n, diasAvisoRetorno: dias, mensagemWhatsapp: msg, permiteTecnicoCliente: permiteTecnicoCliente === true,
  });
}

// -----------------------------------------------------------------------------
// PAINEL DO DONO (planos e regras)
// -----------------------------------------------------------------------------

export function validarPlano({ id, nome, preco, limiteClientes, ilimitado, financeiroCompleto, ativo, descricao }, { novo = false } = {}) {
  const erros = {};
  const idLimpo = texto(id).toLowerCase();
  if (novo && !/^[a-z0-9-]{2,30}$/.test(idLimpo)) erros.id = 'Use só letras minúsculas, números e hífen (2 a 30 caracteres). Ex.: premium';
  const n = texto(nome);
  if (!n) erros.nome = 'Digite o nome do plano.';
  else if (n.length > 40) erros.nome = 'O nome está muito longo (máximo 40 letras).';
  const centavos = reaisParaCentavos(texto(preco) === '' ? '0' : texto(preco));
  if (centavos === null) erros.preco = 'Preço inválido. Exemplo: 24,90';
  let limite = 0;
  if (ilimitado === true) limite = 999999;
  else {
    limite = Number(texto(limiteClientes));
    if (!Number.isInteger(limite) || limite < 0 || limite > 100000) erros.limiteClientes = 'Use um número inteiro de clientes (0 a 100.000).';
  }
  return resultado(erros, {
    id: idLimpo, nome: n, precoCentavos: centavos ?? 0, limiteClientes: limite,
    financeiroCompleto: financeiroCompleto === true, ativo: ativo !== false, descricao: texto(descricao).slice(0, 120),
  });
}

export function validarRegrasGlobais({ diasTeste, descontoAtivo, descontoPercentual, whatsappVendas, instrucoesPagamento }) {
  const erros = {};
  const dias = Number(texto(diasTeste));
  if (!Number.isInteger(dias) || dias < 0 || dias > 90) erros.diasTeste = 'Use de 0 a 90 dias.';
  const perc = Number(texto(descontoPercentual) || '0');
  if (!Number.isFinite(perc) || perc < 0 || perc > 100) erros.descontoPercentual = 'Use um percentual de 0 a 100.';
  let whatsapp = '';
  if (texto(whatsappVendas)) {
    const n = normalizarWhatsappBR(texto(whatsappVendas));
    if (!n) erros.whatsappVendas = 'Número inválido. Digite com DDD.';
    else whatsapp = n;
  }
  const instrucoes = texto(instrucoesPagamento);
  if (instrucoes.length > 500) erros.instrucoesPagamento = 'O texto está muito longo (máximo 500 letras).';
  return resultado(erros, {
    diasTeste: dias, descontoLancamentoAtivo: descontoAtivo === true, descontoLancamentoPercentual: Math.round(perc),
    whatsappVendas: whatsapp, instrucoesPagamento: instrucoes,
  });
}
