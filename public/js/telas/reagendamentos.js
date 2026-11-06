// =============================================================================
// TELA: Aguardando reagendamento (/reagendamentos) — só administrador
// =============================================================================
// Agendamentos cancelados não somem: ficam aqui esperando uma nova data.
//   * Editar    -> abre a tela de editar já com o agendamento: com data ou horário novos ele
//                  vira "Reagendado" (o app confere se o técnico está livre);
//   * Excluir   -> apaga o agendamento (nunca o cliente, os aparelhos nem os
//                  serviços já concluídos).
// =============================================================================

import { html, mostrar, aoClicar, confirmar, comCarregando, toast, mostrarErro } from '../nucleo/ui.js';
import { cabecalho, botao, selo, estadoVazio, esqueletos } from '../nucleo/componentes.js';
import { listarAguardandoReagendamento, excluirAgendamentoCompleto } from '../servicos/servicos.js';
import { agruparAgendamentos, seloDoServico } from '../dominio/servicos.js';
import { formatarDataHoraBR } from '../dominio/datas.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz } = ctx;
  const usuario = contextoDoUsuario();
  const topo = cabecalho({ titulo: 'Aguardando reagendamento', subtitulo: 'Cancelados ou pendentes que precisam de nova data', voltarPara: '#/' });
  let visitas = [];
  let desligar = () => {};

  async function carregar() {
    mostrar(raiz, html`${topo}${esqueletos(3)}`);
    try {
      await carregarEstilos();
      const linhas = await listarAguardandoReagendamento({ empresaId: usuario.empresaId });
      if (!ctx.ativo()) return;
      // Mais antigos primeiro: é o que está esperando há mais tempo.
      visitas = agruparAgendamentos(linhas);
      desenhar();
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, topo);
    }
  }

  const motivoDe = (v) => v.linhas.find((l) => l.pendente && l.motivoPendencia)?.motivoPendencia || '';

  function cartao(v) {
    const primeira = v.linhas[0];
    return html`
      <div class="cartao servico-cartao">
        <div class="pilha pilha--pequena">
          <a href="#/servico/${primeira.id}" class="item-lista__titulo">${v.clienteNome}</a>
          <div>${(() => { const x = seloDoServico(primeira); return selo(x.texto, x.tom); })()}</div>
          ${motivoDe(v) && html`<div class="item-lista__sub">Motivo: ${motivoDe(v)}</div>`}
          <div class="item-lista__sub">Era para ${formatarDataHoraBR(v.dataAgendada)}</div>
          ${primeira.local && html`<div class="item-lista__sub">${primeira.local}</div>`}
          ${v.linhas.map((l) => html`<div class="item-lista__sub">${l.tipoServicoNome}${l.aparelhoResumo ? ` · ${l.aparelhoResumo}` : ''}</div>`)}
        </div>
        <div class="acoes-cartao">
          ${botao({ texto: 'Editar', variante: 'secundario', iconeNome: 'editar', href: `#/servico/${primeira.id}/editar`, pequeno: true })}
          ${botao({ texto: 'Excluir', variante: 'perigo', iconeNome: 'lixeira', acao: 'excluir', dados: { chave: v.chave }, pequeno: true })}
        </div>
      </div>`;
  }

  function desenhar() {
    mostrar(raiz, html`
      ${topo}
      <div class="pilha">
        ${visitas.length === 0
    ? html`<div class="cartao">${estadoVazio({ icone: 'agenda', titulo: 'Nada aguardando', texto: 'Quando você cancelar um agendamento, ele aparece aqui para ser reagendado.' })}</div>`
    : visitas.map(cartao)}
      </div>`);
    desligar();
    desligar = aoClicar(raiz, {
      excluir: async (el) => {
        const v = visitas.find((x) => x.chave === el.dataset.chave);
        if (!v) return;
        if (!await confirmar({ titulo: 'Excluir este agendamento?', mensagem: 'Apaga os dados deste agendamento. Não apaga o cliente nem os aparelhos dele. Não dá para desfazer.', confirmar: 'Excluir agendamento', cancelar: 'Voltar', perigo: true })) return;
        await comCarregando(el, async () => {
          try {
            await excluirAgendamentoCompleto(usuario.empresaId, v.linhas);
            toast('Agendamento excluído.', 'sucesso');
            ctx.recarregar();
          } catch (e) { mostrarErro(e); }
        });
      },
    });
  }

  await carregar();
  return () => desligar();
}
