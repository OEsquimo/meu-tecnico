// =============================================================================
// TELA: Detalhe do serviço (/servico/:id)
// =============================================================================
// Mostra tudo do serviço: cliente, local, aparelho, situação.
//   * TÉCNICO: vê só o que precisa para o trabalho, NUNCA o valor.
//   * ADMINISTRADOR: também vê/edita valor, "pago", descrição, e pode editar,
//     cancelar ou excluir o agendamento.
// =============================================================================

import { html, mostrar, aoClicar, confirmar, comCarregando, toast, mostrarErro } from '../nucleo/ui.js';
import { cabecalho, botao, selo, listaDeDados, esqueletos, aviso } from '../nucleo/componentes.js';
import { ler } from '../nucleo/banco.js';
import { buscarServico, cancelarAgendamento, excluirServico, marcarPago } from '../servicos/servicos.js';
import { seloDoServico, STATUS } from '../dominio/servicos.js';
import { formatarDataHoraBR, formatarDataBR } from '../dominio/datas.js';
import { formatarReais } from '../dominio/dinheiro.js';
import { formatarTelefone } from '../dominio/telefone.js';
import { linkWhatsappDoCliente } from '../dominio/whatsapp.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar, mostrarNaoEncontrado, abrirNavegacao, linkLigar, tituloSecao } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz, params, ir } = ctx;
  const usuario = contextoDoUsuario();
  const voltarPara = '#/agenda';

  async function carregar() {
    mostrar(raiz, html`${cabecalho({ titulo: 'Serviço', voltarPara })}${esqueletos(2)}`);
    try {
      await carregarEstilos();
      const servico = await buscarServico(usuario.empresaId, params.id);
      if (!ctx.ativo()) return;
      if (!servico) return mostrarNaoEncontrado(raiz, 'Serviço não encontrado', 'Ele pode ter sido excluído.', voltarPara);
      // Só o administrador lê o valor (o técnico nem tenta: as regras bloqueiam).
      const valor = usuario.admin && servico.status === STATUS.CONCLUIDO
        ? await ler(`empresas/${usuario.empresaId}/valores/${servico.id}`).catch(() => null)
        : null;
      if (!ctx.ativo()) return;
      desenhar(servico, valor);
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, cabecalho({ titulo: 'Serviço', voltarPara }));
    }
  }

  function desenhar(s, valor) {
    const situacao = seloDoServico(s);
    const agendado = s.status === STATUS.AGENDADO;
    const concluido = s.status === STATUS.CONCLUIDO;
    const ligar = linkLigar(s.clienteWhatsapp);
    const whats = linkWhatsappDoCliente(s.clienteWhatsapp, '');

    mostrar(raiz, html`
      ${cabecalho({ titulo: s.tipoServicoNome, subtitulo: s.clienteNome, voltarPara, acaoDireita: selo(situacao.texto, situacao.tom) })}
      <div class="pilha">
        <div class="cartao">
          ${listaDeDados([
            ['Quando', formatarDataHoraBR(s.dataAgendada)],
            ['Cliente', s.clienteNome],
            ['Telefone', s.clienteWhatsapp ? formatarTelefone(s.clienteWhatsapp) : ''],
            ['Local', s.local],
            ['Aparelho', s.aparelhoResumo],
            ['Técnico', s.tecnicoNome],
            ['Observação', s.descricaoAgendamento || (agendado ? s.descricao : '')],
          ])}
          <div class="acoes-cartao">
            ${botao({ texto: 'Ir até o cliente', variante: 'secundario', iconeNome: 'navegar', acao: 'navegar', pequeno: true })}
            ${ligar ? botao({ texto: 'Ligar', variante: 'secundario', iconeNome: 'telefone', href: ligar, pequeno: true }) : ''}
            ${whats ? botao({ texto: 'WhatsApp', variante: 'whatsapp', iconeNome: 'whatsapp', href: whats, externo: true, pequeno: true }) : ''}
          </div>
        </div>

        ${concluido ? html`
          <div class="cartao">
            ${tituloSecao('Serviço concluído')}
            ${listaDeDados([
              ['Concluído em', formatarDataHoraBR(s.dataConclusao)],
              ['Por', s.concluidoPorNome],
              ['O que foi feito', s.descricao],
              ['Cliente pagou?', s.pago ? 'Sim' : 'Não'],
              ['Valor', usuario.admin ? (valor ? formatarReais(valor.valorCentavos) : 'Ainda não informado') : ''],
              ['Garantia até', s.garantiaAte ? formatarDataBR(s.garantiaAte) : ''],
              ['Próximo retorno', s.dataRetorno ? formatarDataBR(s.dataRetorno) : ''],
            ])}
            ${usuario.admin && html`
              <div class="acoes-cartao">
                ${botao({ texto: s.pago ? 'Marcar como a receber' : 'Marcar como pago', variante: 'secundario', acao: 'alternar-pago', pequeno: true })}
              </div>`}
          </div>
          ${usuario.admin && !valor ? aviso({ tom: 'amarelo', texto: 'Este serviço ainda não tem valor. Informe em Financeiro > Concluídos sem valor.' }) : ''}
        ` : ''}

        ${agendado ? html`
          ${botao({ texto: 'Concluir serviço', iconeNome: 'check', href: `#/concluir/${s.id}`, bloco: true })}
          ${usuario.admin && html`
            <div class="linha">
              ${botao({ texto: 'Editar', variante: 'secundario', iconeNome: 'editar', href: `#/servico/${s.id}/editar` })}
              ${botao({ texto: 'Cancelar', variante: 'perigo', acao: 'cancelar' })}
            </div>`}
        ` : ''}
        ${usuario.admin && !agendado ? botao({ texto: 'Excluir serviço', variante: 'perigo', iconeNome: 'lixeira', acao: 'excluir', bloco: true }) : ''}
      </div>`);

    aoClicar(raiz, {
      navegar: () => abrirNavegacao(s),
      'alternar-pago': (el) => comCarregando(el, async () => {
        try {
          await marcarPago(usuario.empresaId, s.id, !s.pago);
          toast('Atualizado.', 'sucesso');
          ctx.recarregar();
        } catch (e) { mostrarErro(e); }
      }),
      cancelar: async (el) => {
        if (!await confirmar({ titulo: 'Cancelar este agendamento?', mensagem: 'O cliente não será avisado automaticamente.', confirmar: 'Cancelar agendamento', cancelar: 'Voltar', perigo: true })) return;
        await comCarregando(el, async () => {
          try {
            await cancelarAgendamento(usuario.empresaId, s);
            toast('Agendamento cancelado.', 'sucesso');
            ir('/agenda');
          } catch (e) { mostrarErro(e); }
        });
      },
      excluir: async (el) => {
        if (!await confirmar({ titulo: 'Excluir este serviço?', mensagem: 'Some do histórico e do financeiro. Não dá para desfazer.', confirmar: 'Excluir', perigo: true })) return;
        await comCarregando(el, async () => {
          try {
            await excluirServico(usuario.empresaId, s.id);
            toast('Serviço excluído.', 'sucesso');
            ir('/historico');
          } catch (e) { mostrarErro(e); }
        });
      },
    });
  }

  await carregar();
}
