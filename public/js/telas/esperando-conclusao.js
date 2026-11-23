// =============================================================================
// TELA: Esperando conclusão (/esperando-conclusao) — só administrador
// =============================================================================
// Visitas que já passaram do horário previsto e ainda não foram concluídas, as mais antigas primeiro.
// Elas NÃO entram nos totais do Financeiro até serem concluídas. "Concluir" abre a conclusão já com os horários
// sugeridos para o administrador conferir; "Ver serviço" abre o agendamento.
// =============================================================================

import { html, mostrar } from '../nucleo/ui.js';
import { cabecalho, botao, selo, estadoVazio, esqueletos } from '../nucleo/componentes.js';
import { listarEsperandoConclusao } from '../servicos/servicos.js';
import { formatarDataHoraBR } from '../dominio/datas.js';
import { tecnicosDaVisita } from '../dominio/servicos.js';
import { textoDeMinutos, inicioDaVisita, horaDeCampo, FALTAS_ATRASO } from '../dominio/tempo-servico.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz } = ctx;
  const usuario = contextoDoUsuario();
  const topo = cabecalho({ titulo: 'Esperando conclusão', subtitulo: 'Passaram do horário e não foram concluídos', voltarPara: '#/financeiro' });

  async function carregar() {
    mostrar(raiz, html`${topo}${esqueletos(3)}`);
    try {
      await carregarEstilos();
      const visitas = await listarEsperandoConclusao({ empresaId: usuario.empresaId });
      if (!ctx.ativo()) return;
      mostrar(raiz, html`
        ${topo}
        <div class="pilha">
          ${visitas.length === 0
    ? estadoVazio({ icone: 'check', titulo: 'Nada esperando conclusão', texto: 'Todos os serviços que passaram do horário já foram concluídos.' })
    : html`<p class="texto-suave texto-pequeno">Estes serviços não entram nos totais do Financeiro até serem concluídos.</p>
          ${visitas.map(cartao)}`}
        </div>`);
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, topo);
    }
  }

  function cartao(v) {
    const primeira = v.linhas[0];
    const aberta = v.linhas.find((l) => l.status === 'agendado') || primeira;
    const inicio = inicioDaVisita(v.linhas);
    const motivo = v.linhas.find((l) => l.atrasoMotivo);
    const falta = motivo ? FALTAS_ATRASO.find((f) => f.valor === motivo.atrasoFalta)?.rotulo : '';
    const tecnicos = tecnicosDaVisita(v.linhas);
    return html`
      <div class="cartao servico-cartao" data-esperando="${v.chave}">
        <div class="pilha pilha--pequena">
          <a href="#/servico/${primeira.id}" class="item-lista__titulo">${v.clienteNome}</a>
          <div>${selo(`Esperando há ${textoDeMinutos(Math.max(1, v.atrasoMin))}`, 'amarelo')}</div>
          <div class="item-lista__sub">Era para ${formatarDataHoraBR(v.dataAgendada)}</div>
          ${tecnicos && html`<div class="item-lista__sub">Técnico: ${tecnicos}</div>`}
          ${inicio ? html`<div class="item-lista__sub">Em andamento desde ${horaDeCampo(inicio)}</div>` : html`<div class="item-lista__sub">Início não registrado</div>`}
          ${motivo && html`<div class="item-lista__sub">Motivo: ${motivo.atrasoMotivo}${falta ? ` · faltam ${falta}` : ''}</div>`}
        </div>
        <div class="acoes-cartao">
          ${botao({ texto: 'Concluir', iconeNome: 'check', href: `#/concluir/${aberta.id}`, pequeno: true })}
          ${botao({ texto: 'Ver serviço', variante: 'secundario', href: `#/servico/${primeira.id}`, pequeno: true })}
        </div>
      </div>`;
  }

  await carregar();
}
