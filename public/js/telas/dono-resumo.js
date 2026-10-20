// =============================================================================
// TELA: Painel do dono do app — Resumo
// =============================================================================
// Visão geral das contas: quantas empresas, por situação e por plano.
// Só o dono do aplicativo (documento donosApp/{uid}) chega aqui.
// =============================================================================

import { html, mostrar } from '../nucleo/ui.js';
import { cabecalho, esqueletos, estadoVazio, botao, aviso } from '../nucleo/componentes.js';
import { mostrarFalha } from './_auxiliar-admin.js';
import { listarEmpresas, listarPlanos, lerRegras } from '../servicos/planos.js';
import { situacaoConta, rotuloSituacao } from '../dominio/planos.js';
import { REGRAS_PADRAO } from '../nucleo/constantes.js';

export default async function montar(ctx) {
  const { raiz } = ctx;
  const topo = cabecalho({ titulo: 'Painel do dono', subtitulo: 'Visão geral do aplicativo' });
  mostrar(raiz, html`${topo}${esqueletos(3)}`);
  try {
    const [empresas, planos, regras] = await Promise.all([listarEmpresas(), listarPlanos(), lerRegras().catch(() => null)]);
    if (!ctx.ativo()) return;
    const r = regras || REGRAS_PADRAO;
    const porSituacao = {};
    const porPlano = {};
    for (const e of empresas) {
      const s = situacaoConta(e, r);
      porSituacao[s] = (porSituacao[s] || 0) + 1;
      porPlano[e.planoId || 'gratis'] = (porPlano[e.planoId || 'gratis'] || 0) + 1;
    }
    mostrar(raiz, html`
      ${topo}
      <div class="pilha">
        ${planos.length === 0 ? aviso({ tom: 'amarelo', titulo: 'Planos não criados', texto: html`Crie os planos e as regras padrão para o app funcionar direito. ${botao({ texto: 'Ir para Planos', href: '#/dono/planos', pequeno: true })}` }) : ''}
        <div class="cartao painel-numeros">
          <div><span class="numero-grande">${empresas.length}</span><div class="texto-suave">contas</div></div>
          ${Object.entries(porSituacao).map(([s, n]) => html`<div><span class="numero-medio">${n}</span><div class="texto-suave">${rotuloSituacao(s)}</div></div>`)}
        </div>
        ${empresas.length === 0 ? estadoVazio({ icone: 'clientes', titulo: 'Nenhuma conta ainda', texto: 'Quando alguém criar uma conta, ela aparece aqui.' }) : html`
          <div class="cartao">
            <h2 class="titulo-secao">Contas por plano</h2>
            <dl class="dados">${Object.entries(porPlano).map(([id, n]) => html`<dt>${(planos.find((p) => p.id === id) || {}).nome || id}</dt><dd>${n}</dd>`)}</dl>
          </div>`}
      </div>`);
  } catch (erro) {
    if (ctx.ativo()) mostrarFalha(raiz, erro, ctx.recarregar);
  }
}
