// =============================================================================
// AUXILIAR DAS TELAS ADMINISTRATIVAS (não é uma tela: é um módulo de apoio)
// =============================================================================
// Funções pequenas usadas por várias telas de administração e do painel do dono,
// para não repetir código: tela de falha com "Tentar de novo", rótulos de
// situação e de status da equipe.
// =============================================================================

import { html, mostrar, aoClicar } from '../nucleo/ui.js';
import { estadoVazio, botao, selo } from '../nucleo/componentes.js';
import { traduzirErro, ehErroDeRede } from '../nucleo/erros.js';

/**
 * Mostra uma tela de falha (sem internet, erro do servidor) com botão
 * "Tentar de novo". O app nunca fica preso em "carregando".
 * @param {HTMLElement} raiz   onde desenhar
 * @param {unknown} erro       erro capturado
 * @param {() => void} tentar  o que fazer ao tocar no botão (normalmente ctx.recarregar)
 */
export function mostrarFalha(raiz, erro, tentar) {
  console.error(erro);
  const rede = ehErroDeRede(erro);
  mostrar(raiz, estadoVazio({
    icone: rede ? 'alerta' : 'info',
    titulo: rede ? 'Sem conexão' : 'Algo deu errado',
    texto: rede ? 'Confira a internet e tente de novo. Seus dados não foram perdidos.' : traduzirErro(erro),
    acao: botao({ texto: 'Tentar de novo', acao: 'tentar-de-novo' }),
  }));
  aoClicar(raiz, { 'tentar-de-novo': () => tentar() });
}

/** Selo colorido para a situação da conta (ativa, teste, grátis, vencida, bloqueada). */
export function seloSituacao(situacao, rotulo) {
  const tons = { ativa: 'verde', teste: 'azul', gratis: '', vencida: 'amarelo', bloqueada: 'vermelho' };
  return selo(rotulo, tons[situacao] ?? '');
}

/** Selo do status de um funcionário: Ativo / Convite pendente / Bloqueado. */
export function seloStatusEquipe(status) {
  if (status === 'ativo') return selo('Ativo', 'verde');
  if (status === 'bloqueado') return selo('Bloqueado', 'vermelho');
  return selo('Convite pendente', 'amarelo');
}

/** Seta "›" usada à direita das linhas de menu. */
export const seta = html`<span class="texto-suave" aria-hidden="true">›</span>`;
