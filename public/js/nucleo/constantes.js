// =============================================================================
// CONSTANTES DO APLICATIVO
// =============================================================================
// Tudo que é "número mágico" ou lista fixa fica aqui, em um único lugar,
// para facilitar a manutenção e evitar valores diferentes em telas diferentes.
// Este arquivo NÃO importa nenhum outro (é a base de tudo).
// =============================================================================

/** Nome provisório do aplicativo (trocar aqui muda o app inteiro). */
export const NOME_APP = 'Meu Técnico';

/** Versão do SDK do Firebase que o navegador baixa (arquivo nucleo/firebase.js). */
export const VERSAO_SDK_FIREBASE = '10.14.1';

/** Valor usado como "limite ilimitado" nas regras e no app (precisa ser igual em firestore.rules). */
export const LIMITE_ILIMITADO = 999999;

/** Quantos endereços cada cliente pode ter (o segundo fica escondido atrás de um botão). */
export const MAXIMO_ENDERECOS = 2;

/** Prazos de retorno oferecidos (em meses) — "opções prontas", sem digitar. */
export const PRAZOS_RETORNO_MESES = [3, 4, 6, 12];

/** Garantia legal de serviço durável (CDC art. 26): 90 dias. */
export const GARANTIA_DIAS = 90;

/** Quantos dias antes do retorno o app começa a avisar (padrão da empresa, editável). */
export const DIAS_AVISO_RETORNO_PADRAO = 15;

/** Tempo máximo esperando a rede antes de mostrar "sem conexão" (milissegundos). */
export const TIMEOUT_REDE_MS = 15000;

/** Quanto tempo uma lista carregada fica em cache na memória (milissegundos). */
export const VALIDADE_CACHE_MS = 2 * 60 * 1000;

/** Quantidade máxima de documentos lidos de uma vez em listas longas (histórico). */
export const LIMITE_HISTORICO = 200;

/** Tipos de aparelho (valor gravado no banco → texto mostrado na tela). */
export const TIPOS_APARELHO = [
  { valor: 'split', rotulo: 'Split (parede)' },
  { valor: 'janela', rotulo: 'Janela' },
  { valor: 'piso-teto', rotulo: 'Piso/teto' },
  { valor: 'cassete', rotulo: 'Cassete' },
  { valor: 'multi-split', rotulo: 'Multi split' },
  { valor: 'portatil', rotulo: 'Portátil' },
  { valor: 'outro', rotulo: 'Outro' },
];

/** Opções de BTUs mais comuns (o campo também aceita outro valor digitado). */
export const BTUS_COMUNS = [7000, 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000];

/** Duração padrão (em minutos) de um serviço quando o tipo não define a sua. */
export const DURACAO_PADRAO_MIN = 60;

/** Limites aceitos para a duração de um serviço (minutos). */
export const DURACAO_MIN_LIMITE = 15;
export const DURACAO_MAX_LIMITE = 720;

/** Tipos de serviço criados automaticamente em toda conta nova (duracaoMin = minutos). */
export const TIPOS_SERVICO_PADRAO = [
  { nome: 'Limpeza', geraRetorno: true, retornoPadraoMeses: 6, duracaoMin: 60, ativo: true, ordem: 1 },
  { nome: 'Manutenção preventiva', geraRetorno: true, retornoPadraoMeses: 12, duracaoMin: 90, ativo: true, ordem: 2 },
  { nome: 'Instalação', geraRetorno: false, retornoPadraoMeses: 0, duracaoMin: 180, ativo: true, ordem: 3 },
  { nome: 'Retirada de ar-condicionado', geraRetorno: false, retornoPadraoMeses: 0, duracaoMin: 90, ativo: true, ordem: 4 },
  { nome: 'Carga de gás', geraRetorno: false, retornoPadraoMeses: 0, duracaoMin: 60, ativo: true, ordem: 5 },
];

/** Texto padrão do lembrete de retorno enviado pelo WhatsApp. Variáveis entre chaves. */
export const MENSAGEM_WHATSAPP_PADRAO =
  'Olá, {nome}! Tudo bem? Aqui é da {empresa}. ' +
  'Já está na hora da {servico} do seu ar-condicionado ({aparelho}). ' +
  'Quer agendar um horário?';

/** Planos criados pelo botão "Criar planos e regras padrão" do painel do dono. */
export const PLANOS_PADRAO = [
  { id: 'gratis', nome: 'Grátis', precoCentavos: 0, limiteClientes: 10, financeiroCompleto: false, ativo: true, ordem: 1, descricao: 'Até 10 clientes' },
  { id: 'basico', nome: 'Básico', precoCentavos: 1490, limiteClientes: 20, financeiroCompleto: true, ativo: true, ordem: 2, descricao: 'Até 20 clientes' },
  { id: 'medio', nome: 'Médio', precoCentavos: 2490, limiteClientes: 30, financeiroCompleto: true, ativo: true, ordem: 3, descricao: 'Até 30 clientes' },
  { id: 'avancado', nome: 'Avançado', precoCentavos: 3990, limiteClientes: 50, financeiroCompleto: true, ativo: true, ordem: 4, descricao: 'Até 50 clientes' },
  { id: 'ilimitado', nome: 'Ilimitado', precoCentavos: 5990, limiteClientes: LIMITE_ILIMITADO, financeiroCompleto: true, ativo: true, ordem: 5, descricao: 'Clientes sem limite' },
];

/** Regras globais iniciais (dias de teste etc.). */
export const REGRAS_PADRAO = {
  diasTeste: 7,
  descontoLancamentoAtivo: false,
  descontoLancamentoPercentual: 0,
};

/** Endereços das APIs públicas usadas (gratuitas, sem chave). */
export const URL_VIACEP = 'https://viacep.com.br/ws';
export const URL_NOMINATIM = 'https://nominatim.openstreetmap.org';

/** Versão do formato do arquivo de backup JSON. */
export const VERSAO_BACKUP = 1;

/** Estados brasileiros (sigla → nome), para a busca de endereço sem CEP. */
export const ESTADOS_BR = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'],
  ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'],
  ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'],
  ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'], ['PI', 'Piauí'],
  ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'],
  ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
  ['SE', 'Sergipe'], ['TO', 'Tocantins'],
];
