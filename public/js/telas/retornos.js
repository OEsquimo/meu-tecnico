// =============================================================================
// TELA: Retornos (lembretes de limpeza / manutenção preventiva) — só administrador
// =============================================================================
// Duas abas: "Vencidos" (já passou da data) e "Próximos" (dentro dos dias de
// aviso configurados). Para cada cliente:
//   * WhatsApp  -> abre o WhatsApp com a mensagem pronta (o envio é manual);
//   * Agendar   -> abre a tela de agendar já preenchida;
//   * Adiar     -> empurra o lembrete 7/15/30 dias;
//   * Não quer mais -> encerra o lembrete.
// =============================================================================

import { html, mostrar, aoClicar, escolher, confirmar, toast, mostrarErro } from '../nucleo/ui.js';
import { cabecalho, botao, selo, abas, estadoVazio, esqueletos } from '../nucleo/componentes.js';
import { sessao } from '../nucleo/sessao.js';
import { listarRetornos, registrarAviso, adiarRetornoDoServico, recusarRetorno } from '../servicos/servicos.js';
import { OPCOES_ADIAR_DIAS } from '../dominio/retornos.js';
import { montarMensagem, linkWhatsappDoCliente } from '../dominio/whatsapp.js';
import { formatarDataBR } from '../dominio/datas.js';
import { MENSAGEM_WHATSAPP_PADRAO, DIAS_AVISO_RETORNO_PADRAO } from '../nucleo/constantes.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar, hojeIso, primeiroNome } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz, ir } = ctx;
  const usuario = contextoDoUsuario();
  const diasAviso = sessao.empresa?.diasAvisoRetorno ?? DIAS_AVISO_RETORNO_PADRAO;
  const topo = cabecalho({ titulo: 'Retornos', subtitulo: 'Clientes que já podem voltar', voltarPara: '#/' });
  let aba = 'vencidos';
  let dados = { vencidos: [], proximos: [] };

  async function carregar() {
    mostrar(raiz, html`${topo}${esqueletos(3)}`);
    try {
      await carregarEstilos();
      dados = await listarRetornos({ empresaId: usuario.empresaId, hojeISO: hojeIso(), diasAviso });
      if (!ctx.ativo()) return;
      desenhar();
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, topo);
    }
  }

  const achar = (id) => [...dados.vencidos, ...dados.proximos].find((s) => s.id === id);

  function cartao(s) {
    const dias = s.diasParaRetorno;
    const quando = dias < 0 ? `Venceu há ${-dias} dia${dias === -1 ? '' : 's'}` : dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia${dias === 1 ? '' : 's'}`;
    return html`
      <div class="cartao servico-cartao ${dias < 0 ? 'servico-cartao--atrasado' : ''}">
        <div class="linha linha--entre">
          <div class="expande">
            <div class="item-lista__titulo">${s.clienteNome}</div>
            <div class="item-lista__sub">${s.tipoServicoNome}${s.aparelhoResumo ? ` · ${s.aparelhoResumo}` : ''}</div>
            <div class="item-lista__sub">${quando} (${formatarDataBR(s.dataRetorno)})</div>
            ${s.ultimoAvisoEm && html`<div class="item-lista__sub">Avisado em ${formatarDataBR(s.ultimoAvisoEm)}</div>`}
          </div>
          ${dias < 0 ? selo('Vencido', 'vermelho') : selo('Próximo', 'amarelo')}
        </div>
        <div class="acoes-cartao">
          ${botao({ texto: 'WhatsApp', variante: 'whatsapp', iconeNome: 'whatsapp', acao: 'avisar', dados: { id: s.id }, pequeno: true })}
          ${botao({ texto: 'Agendar', iconeNome: 'agenda', acao: 'agendar', dados: { id: s.id }, pequeno: true })}
          ${botao({ texto: 'Adiar', variante: 'secundario', acao: 'adiar', dados: { id: s.id }, pequeno: true })}
          ${botao({ texto: 'Não quer mais', variante: 'fantasma', acao: 'recusar', dados: { id: s.id }, pequeno: true })}
        </div>
      </div>`;
  }

  function desenhar() {
    const lista = dados[aba];
    mostrar(raiz, html`
      ${topo}
      <div class="pilha">
        ${abas([
          { id: 'vencidos', rotulo: 'Vencidos', contagem: dados.vencidos.length },
          { id: 'proximos', rotulo: 'Próximos', contagem: dados.proximos.length },
        ], aba)}
        ${lista.length === 0
          ? estadoVazio({ icone: 'sino', titulo: aba === 'vencidos' ? 'Nenhum retorno vencido' : 'Nenhum retorno próximo', texto: `Os próximos aparecem ${diasAviso} dias antes da data.` })
          : html`<div class="pilha">${lista.map(cartao)}</div>`}
      </div>`);
  }

  aoClicar(raiz, {
    aba: (el) => { aba = el.dataset.aba; desenhar(); },

    avisar: async (el) => {
      const s = achar(el.dataset.id);
      if (!s) return;
      const texto = montarMensagem(sessao.empresa?.mensagemWhatsapp || MENSAGEM_WHATSAPP_PADRAO, {
        nome: primeiroNome(s.clienteNome), empresa: sessao.empresa?.nome || '', servico: s.tipoServicoNome, aparelho: s.aparelhoResumo || 'seu aparelho',
      });
      const link = linkWhatsappDoCliente(s.clienteWhatsapp, texto);
      if (!link) { toast('O telefone deste cliente é inválido. Corrija no cadastro.', 'erro'); return; }
      window.open(link, '_blank', 'noopener');
      try { await registrarAviso(usuario.empresaId, s.id); } catch { /* o aviso foi aberto; só não anotamos */ }
    },

    agendar: (el) => {
      const s = achar(el.dataset.id);
      if (!s) return;
      const q = new URLSearchParams({ cliente: s.clienteId, tipo: s.tipoServicoId, retorno: s.id });
      if (s.aparelhoId) q.set('aparelho', s.aparelhoId);
      ir(`/agendar?${q.toString()}`);
    },

    adiar: async (el) => {
      const s = achar(el.dataset.id);
      if (!s) return;
      const dias = await escolher({
        titulo: 'Adiar o lembrete', mensagem: `${s.clienteNome}: avisar de novo daqui a quanto tempo?`,
        opcoes: OPCOES_ADIAR_DIAS.map((d) => ({ id: String(d), rotulo: `${d} dias` })),
      });
      if (!dias) return;
      try {
        const novo = await adiarRetornoDoServico(usuario.empresaId, s, Number(dias), hojeIso());
        toast(`Adiado para ${formatarDataBR(novo)}.`, 'sucesso');
        ctx.recarregar();
      } catch (e) { mostrarErro(e); }
    },

    recusar: async (el) => {
      const s = achar(el.dataset.id);
      if (!s) return;
      if (!await confirmar({ titulo: 'Cliente não quer mais?', mensagem: `${s.clienteNome} não será mais lembrado deste serviço.`, confirmar: 'Encerrar lembrete', perigo: true })) return;
      try {
        await recusarRetorno(usuario.empresaId, s.id);
        toast('Lembrete encerrado.', 'sucesso');
        ctx.recarregar();
      } catch (e) { mostrarErro(e); }
    },
  });

  await carregar();
}
