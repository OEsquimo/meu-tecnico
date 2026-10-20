// =============================================================================
// EMPRESAS — criar conta, configurações e exclusão de conta (LGPD)
// =============================================================================
// "Empresa" é o inquilino do sistema: um técnico autônomo OU uma firma com
// vários técnicos. Todos os dados (clientes, serviços...) ficam DENTRO de
// empresas/{empresaId}, e as regras do Firestore impedem que uma empresa veja
// os dados de outra.
// =============================================================================

import { ler, listar, gravar, operacao as op, novoId, AGORA, emPedacos } from '../nucleo/banco.js';
import { criarLogin, excluirLogin, reautenticar } from '../nucleo/autenticacao.js';
import { invalidarCache } from '../nucleo/cache.js';
import { ErroApp } from '../nucleo/erros.js';
import { comSessaoPausada } from '../nucleo/sessao.js';
import { TIPOS_SERVICO_PADRAO, DIAS_AVISO_RETORNO_PADRAO, MENSAGEM_WHATSAPP_PADRAO } from '../nucleo/constantes.js';

/**
 * Cria o login E a empresa. É o cadastro de quem compra o app (administrador).
 * Se o login for criado mas a gravação falhar (internet caiu no meio), o app
 * mostra a tela "Concluir cadastro" (ver concluirCadastroDaEmpresa).
 */
export function cadastrarEmpresaEAdmin({ nome, nomeEmpresa, email, senha }) {
  return comSessaoPausada(async () => {
    const usuario = await criarLogin(email, senha);
    await concluirCadastroDaEmpresa({ uid: usuario.uid, email: usuario.email, nome, nomeEmpresa });
    return usuario;
  });
}

/**
 * Cria os documentos da empresa para um login que já existe.
 * O id da empresa é o próprio uid do administrador (simples e sem duplicidade).
 */
export async function concluirCadastroDaEmpresa({ uid, email, nome, nomeEmpresa }) {
  const empresaId = uid;
  await gravar([
    op.criar(`empresas/${empresaId}`, {
      nome: nomeEmpresa || nome,
      donoUid: uid,
      emailAdmin: email,
      nomeAdmin: nome,
      planoId: 'gratis', // o plano grátis começa com período de teste (dias definidos pelo dono do app)
      planoAte: null,
      testeEstendidoAte: null,
      bloqueada: false,
      contadorClientes: 0,
      permiteTecnicoCliente: false,
      diasAvisoRetorno: DIAS_AVISO_RETORNO_PADRAO,
      mensagemWhatsapp: MENSAGEM_WHATSAPP_PADRAO,
      criadoEm: AGORA,
    }),
    op.criar(`usuarios/${uid}`, { empresaId, papel: 'admin', ativo: true, nome, criadoEm: AGORA }),
  ]);
  // Os tipos padrão precisam de um SEGUNDO lote: as regras só reconhecem o
  // administrador depois que o primeiro lote foi gravado.
  try {
    await criarTiposPadrao(empresaId);
  } catch {
    /* sem problema: garantirTiposPadrao() tenta de novo quando o app abrir */
  }
  return empresaId;
}

/** Cria Limpeza, Manutenção preventiva, Instalação, Retirada e Carga de gás. */
export async function criarTiposPadrao(empresaId) {
  const operacoes = TIPOS_SERVICO_PADRAO.map((t) => op.criar(`empresas/${empresaId}/tiposServico/${novoId(`empresas/${empresaId}/tiposServico`)}`, t));
  await gravar(operacoes);
}

/** Se a empresa não tem nenhum tipo de serviço (cadastro interrompido), cria os padrões. Retorna true se criou. */
export async function garantirTiposPadrao(empresaId) {
  const existentes = await listar(`empresas/${empresaId}/tiposServico`, { limite: 1 });
  if (existentes.length > 0) return false;
  await criarTiposPadrao(empresaId);
  return true;
}

/** Salva as configurações da empresa (nome, aviso de retorno, texto do WhatsApp, permissão do técnico). */
export async function salvarConfiguracoes(empresaId, { nome, diasAvisoRetorno, mensagemWhatsapp, permiteTecnicoCliente }) {
  await gravar([op.atualizar(`empresas/${empresaId}`, { nome, diasAvisoRetorno, mensagemWhatsapp, permiteTecnicoCliente })]);
}

/** Apaga em lotes todos os documentos de uma coleção. Retorna quantos apagou. */
async function apagarColecao(caminho) {
  const docs = await listar(caminho);
  for (const pedaco of emPedacos(docs, 400)) {
    await gravar(pedaco.map((d) => op.apagar(`${caminho}/${d.id}`)));
  }
  return docs.length;
}

/**
 * EXCLUI A CONTA INTEIRA (direito de eliminação — LGPD): todos os clientes,
 * aparelhos, serviços, valores, equipe e o login do administrador.
 * Não dá para desfazer: a tela exige senha e confirmação antes de chamar.
 *
 * @param {string} empresaId
 * @param {string} senha senha atual (reautenticação exigida pelo Firebase)
 * @param {(texto:string)=>void} aoProgresso mostra o andamento na tela
 */
export async function excluirContaCompleta(empresaId, senha, aoProgresso = () => {}) {
  if (!senha) throw new ErroApp('Digite a sua senha para confirmar.', 'sem-senha');
  await reautenticar(senha); // se a senha estiver errada, nada é apagado

  aoProgresso('Apagando serviços…');
  await apagarColecao(`empresas/${empresaId}/servicos`);
  await apagarColecao(`empresas/${empresaId}/valores`);

  aoProgresso('Apagando aparelhos…');
  await apagarColecao(`empresas/${empresaId}/aparelhos`);

  aoProgresso('Apagando clientes…');
  const empresa = await ler(`empresas/${empresaId}`);
  let contador = empresa?.contadorClientes ?? 0;
  const clientes = await listar(`empresas/${empresaId}/clientes`);
  for (const c of clientes) {
    // Cada cliente sai num lote próprio, junto com a baixa do contador (exigência das regras).
    contador = Math.max(0, contador - 1);
    await gravar([
      op.apagar(`empresas/${empresaId}/clientes/${c.id}`),
      op.atualizar(`empresas/${empresaId}`, { contadorClientes: contador, ultimoClienteId: c.id }),
    ]);
  }

  aoProgresso('Apagando equipe…');
  const equipe = await listar(`empresas/${empresaId}/equipe`);
  for (const m of equipe) {
    const operacoes = [op.apagar(`empresas/${empresaId}/equipe/${m.id}`)];
    if (m.uid) operacoes.push(op.apagar(`usuarios/${m.uid}`));
    await gravar(operacoes);
  }
  await apagarColecao(`empresas/${empresaId}/tiposServico`);

  aoProgresso('Encerrando a conta…');
  await gravar([op.apagar(`empresas/${empresaId}`)]);
  // Segundo lote: as regras só deixam apagar o vínculo depois que a empresa não existe mais.
  await gravar([op.apagar(`usuarios/${empresaId}`)]);
  invalidarCache();
  await excluirLogin();
}
