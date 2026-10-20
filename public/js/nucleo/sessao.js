// =============================================================================
// SESSÃO — quem está usando o app agora, de qual empresa, com qual plano
// =============================================================================
// Quando o login muda, este módulo carrega (nesta ordem):
//   1. usuarios/{uid}      -> a qual empresa e papel o login pertence
//   2. donosApp/{uid}      -> se é o dono do aplicativo
//   3. empresas/{empresa}  -> nome, plano, contador de clientes, configurações
//   4. planos, config/regras e tiposServico
//
// Estados possíveis (sessao.estado) — cada um tem uma tela própria:
//   'iniciando'         abrindo o app (tela de abertura com barra de progresso)
//   'visitante'         ninguém logado
//   'carregando'        logado, buscando os dados
//   'pronto'            tudo certo, app liberado
//   'sem-vinculo'       logado, mas sem empresa (cadastro incompleto ou removido)
//   'dono'              é o dono do app e ainda não tem empresa -> vai ao painel
//   'usuario-bloqueado' o administrador bloqueou este técnico
//   'conta-bloqueada'   o dono do app bloqueou a empresa
//   'erro'              falha ao carregar (sem internet etc.) -> "Tentar de novo"
// =============================================================================

import { ler, listar } from './banco.js';
import { observarLogin, sair as sairDoLogin } from './autenticacao.js';
import { limparCache } from './cache.js';
import { ehErroDeRede, traduzirErro } from './erros.js';
import { REGRAS_PADRAO } from './constantes.js';
import { situacaoConta, limiteEfetivo, podeCadastrarCliente, temFinanceiroCompleto } from '../dominio/planos.js';

/** Plano grátis "de segurança", igual ao que as regras do Firestore assumem se o documento não existir. */
const PLANO_GRATIS_PADRAO = {
  id: 'gratis', nome: 'Grátis', precoCentavos: 0, limiteClientes: 10,
  financeiroCompleto: false, ativo: true, ordem: 1, descricao: 'Até 10 clientes',
};

export const sessao = {
  estado: 'iniciando',
  usuario: null, // { uid, email }
  vinculo: null, // documento usuarios/{uid}
  papel: null, // 'admin' | 'tecnico'
  empresa: null, // documento empresas/{id} (com .id)
  planos: { gratis: PLANO_GRATIS_PADRAO },
  regras: { ...REGRAS_PADRAO },
  tipos: [], // tipos de serviço da empresa
  ehDonoApp: false,
  erro: null, // { mensagem, rede }
};

const ouvintes = new Set();
let geracao = 0; // descarta respostas de carregamentos antigos
let pausas = 0; // > 0 enquanto um cadastro/convite está sendo gravado
let usuarioPendente = null; // login que chegou durante a pausa

/** Avisa o roteador/telas que a sessão mudou. */
export function aoMudarSessao(funcao) {
  ouvintes.add(funcao);
  return () => ouvintes.delete(funcao);
}

function definir(parcial) {
  Object.assign(sessao, parcial);
  for (const f of ouvintes) f(sessao);
}

function mapaDePlanos(lista) {
  const mapa = { gratis: PLANO_GRATIS_PADRAO };
  for (const p of lista) mapa[p.id] = p;
  return mapa;
}

function ordenarTipos(lista) {
  return [...lista].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

/** Carrega tudo do usuário logado. Nunca lança erro: vira estado 'erro' com botão "Tentar de novo". */
async function carregar(usuario) {
  const minha = ++geracao;
  definir({ estado: 'carregando', usuario, erro: null });
  try {
    const uid = usuario.uid;
    const [vinculo, donoDoc] = await Promise.all([ler(`usuarios/${uid}`), ler(`donosApp/${uid}`)]);
    if (minha !== geracao) return;
    const ehDonoApp = !!donoDoc;

    if (!vinculo) {
      definir({ estado: ehDonoApp ? 'dono' : 'sem-vinculo', vinculo: null, papel: null, empresa: null, ehDonoApp, tipos: [] });
      return;
    }
    if (vinculo.ativo === false) {
      definir({ estado: 'usuario-bloqueado', vinculo, papel: vinculo.papel, empresa: null, ehDonoApp, tipos: [] });
      return;
    }

    const empresaId = vinculo.empresaId;
    const [empresa, listaPlanos, regras, tipos] = await Promise.all([
      ler(`empresas/${empresaId}`),
      listar('planos'),
      ler('config/regras'),
      listar(`empresas/${empresaId}/tiposServico`),
    ]);
    if (minha !== geracao) return;

    if (!empresa) {
      definir({ estado: 'sem-vinculo', vinculo, papel: null, empresa: null, ehDonoApp, tipos: [] });
      return;
    }
    definir({
      estado: empresa.bloqueada === true ? 'conta-bloqueada' : 'pronto',
      vinculo,
      papel: vinculo.papel,
      empresa,
      planos: mapaDePlanos(listaPlanos),
      regras: { ...REGRAS_PADRAO, ...(regras || {}) },
      tipos: ordenarTipos(tipos),
      ehDonoApp,
    });
  } catch (erro) {
    if (minha !== geracao) return;
    definir({ estado: 'erro', erro: { mensagem: traduzirErro(erro), rede: ehErroDeRede(erro) } });
  }
}

/**
 * Executa "funcao" com o carregamento da sessão em PAUSA.
 * Usado no cadastro: o login é criado primeiro e a empresa depois; sem a pausa,
 * o app procuraria a empresa antes dela existir e mostraria "sem vínculo".
 * Ao terminar (com sucesso ou erro), a sessão é carregada normalmente.
 */
export async function comSessaoPausada(funcao) {
  pausas += 1;
  try {
    return await funcao();
  } finally {
    pausas -= 1;
    if (pausas === 0 && usuarioPendente) {
      const usuario = usuarioPendente;
      usuarioPendente = null;
      await carregar(usuario);
    }
  }
}

/** Liga a sessão ao login. Chamar UMA vez na abertura do app. */
export function iniciarSessao() {
  return observarLogin((usuario) => {
    if (usuario && pausas > 0) {
      usuarioPendente = usuario;
      definir({ estado: 'carregando', usuario, erro: null });
      return;
    }
    if (!usuario) {
      usuarioPendente = null;
      geracao += 1;
      limparCache();
      definir({
        estado: 'visitante', usuario: null, vinculo: null, papel: null, empresa: null,
        tipos: [], ehDonoApp: false, erro: null,
      });
    } else {
      carregar(usuario);
    }
  });
}

/** Recarrega tudo (botão "Tentar de novo" ou depois de criar a empresa/aceitar convite). */
export async function recarregarSessao() {
  if (sessao.usuario) await carregar(sessao.usuario);
}

/** Atualiza só a empresa (contador de clientes, configurações, plano). */
export async function recarregarEmpresa() {
  if (!sessao.vinculo) return;
  const empresa = await ler(`empresas/${sessao.vinculo.empresaId}`);
  if (empresa) {
    definir({ empresa, estado: empresa.bloqueada === true ? 'conta-bloqueada' : sessao.estado });
  }
}

/** Atualiza só os tipos de serviço. */
export async function recarregarTipos() {
  if (!sessao.vinculo) return;
  const tipos = await listar(`empresas/${sessao.vinculo.empresaId}/tiposServico`);
  definir({ tipos: ordenarTipos(tipos) });
}

/** Sai do app e limpa tudo que estava na memória. */
export async function sairDaSessao() {
  await sairDoLogin();
  limparCache();
}

// -----------------------------------------------------------------------------
// ATALHOS (valores calculados a partir da sessão)
// -----------------------------------------------------------------------------

export const empresaId = () => sessao.vinculo?.empresaId ?? null;
export const tiposAtivos = () => sessao.tipos.filter((t) => t.ativo !== false);

export function situacaoAtual() {
  return sessao.empresa ? situacaoConta(sessao.empresa, sessao.regras) : 'gratis';
}

/** Resumo para a tela "Meu plano" e para avisos: { plano, situacao, limite, usados, podeCadastrar } */
export function resumoDoPlano() {
  const e = sessao.empresa;
  if (!e) return null;
  const situacao = situacaoConta(e, sessao.regras);
  const limite = limiteEfetivo(e, sessao.planos, sessao.regras);
  const permissao = podeCadastrarCliente(e, sessao.planos, sessao.regras);
  return {
    plano: sessao.planos[e.planoId] || PLANO_GRATIS_PADRAO,
    situacao,
    limite,
    usados: e.contadorClientes ?? 0,
    podeCadastrar: permissao.ok,
    motivoBloqueio: permissao.motivo,
    financeiroCompleto: temFinanceiroCompleto(e, sessao.planos, sessao.regras),
  };
}
