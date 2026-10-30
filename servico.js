// =============================================================================
// TELA: Detalhe do agendamento / serviço (/servico/:id)
// =============================================================================
// Mostra a visita inteira: cliente, local, dia e hora, e UM CARTÃO POR APARELHO
// com um cartão por serviço dentro (cada um com seu técnico e seu botão
// "Concluir serviço"). Serviços antigos aparecem como uma visita de um serviço.
//   * TÉCNICO: vê só os serviços dele, NUNCA o valor. Pode adicionar serviço
//     na visita (depois de escolher ou cadastrar o aparelho).
//   * ADMINISTRADOR: também vê/edita valor e "pago", e pode editar, cancelar
//     ou excluir o agendamento.
// =============================================================================

import { html, mostrar, aoClicar, confirmar, comCarregando, toast, mostrarErro, escolher } from '../nucleo/ui.js';
import { cabecalho, botao, selo, listaDeDados, esqueletos, aviso } from '../nucleo/componentes.js';
import { ler } from '../nucleo/banco.js';
import { sessao, tiposAtivos } from '../nucleo/sessao.js';
import {
  buscarServico, listarLinhasDoAgendamento, cancelarAgendamentoCompleto, excluirAgendamentoCompleto, marcarPago, adicionarServicoNaVisita,
} from '../servicos/servicos.js';
import { listarAparelhosDoCliente } from '../servicos/aparelhos.js';
import { seloDoServico, STATUS, ehLinhaSemServico } from '../dominio/servicos.js';
import { resumoDoAparelho } from '../dominio/aparelhos.js';
import { formatarDataHoraBR, formatarDataBR } from '../dominio/datas.js';
import { formatarReais } from '../dominio/dinheiro.js';
import { formatarTelefone } from '../dominio/telefone.js';
import { linkWhatsappDoCliente } from '../dominio/whatsapp.js';
import { textoDoRetorno } from './agendamento-comum.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar, mostrarNaoEncontrado, abrirNavegacao, linkLigar, tituloSecao } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz, params, ir } = ctx;
  const usuario = contextoDoUsuario();
  const voltarPara = '#/agenda';
  let desligar = () => {}; // remove os cliques ao sair da tela (não vazam para a próxima)

  async function carregar() {
    mostrar(raiz, html`${cabecalho({ titulo: 'Serviço', voltarPara })}${esqueletos(2)}`);
    try {
      await carregarEstilos();
      const servico = await buscarServico(usuario.empresaId, params.id);
      if (!ctx.ativo()) return;
      if (!servico) return mostrarNaoEncontrado(raiz, 'Serviço não encontrado', 'Ele pode ter sido excluído.', voltarPara);
      const linhas = await listarLinhasDoAgendamento(usuario.empresaId, servico, { tecnicoUid: usuario.admin ? null : usuario.uid });
      // Se a consulta não trouxe a própria linha (por segurança), mostra ao menos ela.
      if (!linhas.some((l) => l.id === servico.id)) linhas.push(servico);
      // Só o administrador lê o valor (o técnico nem tenta: as regras bloqueiam).
      const valores = {};
      if (usuario.admin) {
        await Promise.all(linhas.filter((l) => l.status === STATUS.CONCLUIDO).map(async (l) => {
          valores[l.id] = await ler(`empresas/${usuario.empresaId}/valores/${l.id}`).catch(() => null);
        }));
      }
      if (!ctx.ativo()) return;
      desenhar(servico, linhas, valores);
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, cabecalho({ titulo: 'Serviço', voltarPara }));
    }
  }

  /** Agrupa as linhas por aparelho (linhas sem aparelho ficam juntas). */
  function porAparelho(linhas) {
    const mapa = new Map();
    for (const l of linhas) {
      const chave = l.aparelhoId || '';
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(l);
    }
    return [...mapa.entries()];
  }

  function cartaoDaLinha(l, valores) {
    const sit = seloDoServico(l);
    const agendada = l.status === STATUS.AGENDADO;
    const concluida = l.status === STATUS.CONCLUIDO;
    const valor = valores[l.id];
    const nota = l.obsServico || (agendada ? l.descricao : '');
    return html`
      <div class="visita-servico ${concluida ? 'visita-servico--concluido' : ''} ${l.status === STATUS.CANCELADO ? 'visita-servico--cancelado' : ''}" data-linha="${l.id}">
        <div class="visita-servico__topo">
          <div class="expande">
            <div class="item-lista__titulo">${l.tipoServicoNome}</div>
            <div class="item-lista__sub">${l.tecnicoNome ? `Técnico: ${l.tecnicoNome}` : 'Sem técnico'}</div>
          </div>
          ${!ehLinhaSemServico(l) && selo(textoDoRetorno(sessao.tipos.find((t) => t.id === l.tipoServicoId) || { geraRetorno: l.geraRetorno, retornoPadraoMeses: l.retornoMeses }), l.geraRetorno ? 'azul' : '')}
          ${selo(sit.texto, sit.tom)}
        </div>
        ${nota && html`<div class="visita-obs">${nota}</div>`}
        ${concluida && listaDeDados([
          ['Concluído em', formatarDataHoraBR(l.dataConclusao)],
          ['Por', l.concluidoPorNome],
          ['O que foi feito', l.descricao],
          ['Cliente pagou?', l.pago ? 'Sim' : 'Não'],
          ['Valor', usuario.admin ? (valor ? formatarReais(valor.valorCentavos) : 'Ainda não informado') : ''],
          ['Garantia até', l.garantiaAte ? formatarDataBR(l.garantiaAte) : ''],
          ['Próximo retorno', l.dataRetorno ? formatarDataBR(l.dataRetorno) : ''],
        ])}
        ${concluida && usuario.admin && html`
          <div class="acoes-cartao">
            ${botao({ texto: l.pago ? 'Marcar como a receber' : 'Marcar como pago', variante: 'secundario', acao: 'alternar-pago', dados: { id: l.id }, pequeno: true })}
          </div>`}
        ${concluida && usuario.admin && !valor ? aviso({ tom: 'amarelo', texto: 'Este serviço ainda não tem valor. Informe em Financeiro > Concluídos sem valor.' }) : ''}
        ${agendada && botao({ texto: 'Concluir serviço', iconeNome: 'check', href: `#/concluir/${l.id}`, bloco: true })}
      </div>`;
  }

  function desenhar(s, linhas, valores) {
    const abertas = linhas.filter((l) => l.status === STATUS.AGENDADO);
    const agendado = abertas.length > 0;
    const situacao = agendado ? seloDoServico(abertas[0]) : seloDoServico(linhas.find((l) => l.status === STATUS.CONCLUIDO) || linhas[0]);
    const ligar = linkLigar(s.clienteWhatsapp);
    const whats = linkWhatsappDoCliente(s.clienteWhatsapp, '');
    const tecnicos = [...new Set(linhas.map((l) => l.tecnicoNome).filter(Boolean))].join(', ');
    const observacao = s.obsAgendamento || '';
    const unico = linhas.length === 1 && !ehLinhaSemServico(linhas[0]);
    const grupos = porAparelho(linhas);

    mostrar(raiz, html`
      ${cabecalho({ titulo: unico ? s.tipoServicoNome : 'Agendamento', subtitulo: s.clienteNome, voltarPara, acaoDireita: selo(situacao.texto, situacao.tom) })}
      <div class="pilha">
        <div class="cartao">
          ${listaDeDados([
            ['Quando', formatarDataHoraBR(s.dataAgendada)],
            ['Cliente', s.clienteNome],
            ['Telefone', s.clienteWhatsapp ? formatarTelefone(s.clienteWhatsapp) : ''],
            ['Local', s.local],
            ['Técnicos', tecnicos],
            ['Observação', observacao],
          ])}
          <div class="acoes-cartao">
            ${botao({ texto: 'Ir até o cliente', variante: 'secundario', iconeNome: 'navegar', acao: 'navegar', pequeno: true })}
            ${ligar ? botao({ texto: 'Ligar', variante: 'secundario', iconeNome: 'telefone', href: ligar, pequeno: true }) : ''}
            ${whats ? botao({ texto: 'WhatsApp', variante: 'whatsapp', iconeNome: 'whatsapp', href: whats, externo: true, pequeno: true }) : ''}
          </div>
        </div>

        ${tituloSecao('Aparelhos e serviços')}
        ${grupos.map(([aparelhoId, lista]) => html`
          <section class="cartao visita-aparelho">
            <div>
              <div class="item-lista__titulo">${aparelhoId ? (lista[0].aparelhoResumo || 'Aparelho') : 'Aparelho ainda não escolhido'}</div>
              ${!aparelhoId && html`<div class="item-lista__sub">Escolha ou cadastre o aparelho ao concluir o serviço.</div>`}
              ${lista[0].obsAparelho && html`<div class="visita-obs">${lista[0].obsAparelho}</div>`}
            </div>
            ${lista.map((l) => cartaoDaLinha(l, valores))}
          </section>`)}

        ${agendado ? botao({ texto: 'Adicionar serviço na visita', variante: 'secundario', iconeNome: 'mais', acao: 'adicionar-servico', bloco: true }) : ''}
        ${usuario.admin && agendado ? html`
          <div class="linha">
            ${botao({ texto: 'Editar', variante: 'secundario', iconeNome: 'editar', href: `#/servico/${s.id}/editar` })}
            ${botao({ texto: 'Cancelar', variante: 'perigo', acao: 'cancelar' })}
          </div>` : ''}
        ${usuario.admin && !agendado ? botao({ texto: 'Excluir serviço', variante: 'perigo', iconeNome: 'lixeira', acao: 'excluir', bloco: true }) : ''}
      </div>`);

    desligar();
    desligar = aoClicar(raiz, {
      navegar: () => abrirNavegacao(s),
      'alternar-pago': (el) => comCarregando(el, async () => {
        try {
          const linha = linhas.find((l) => l.id === el.dataset.id);
          await marcarPago(usuario.empresaId, linha.id, !linha.pago);
          toast('Atualizado.', 'sucesso');
          ctx.recarregar();
        } catch (e) { mostrarErro(e); }
      }),
      'adicionar-servico': (el) => adicionarServico(el, s, abertas),
      cancelar: async (el) => {
        if (!await confirmar({ titulo: 'Cancelar este agendamento?', mensagem: 'O cliente não será avisado automaticamente.', confirmar: 'Cancelar agendamento', cancelar: 'Voltar', perigo: true })) return;
        await comCarregando(el, async () => {
          try {
            await cancelarAgendamentoCompleto(usuario.empresaId, linhas);
            toast('Agendamento cancelado.', 'sucesso');
            ir('/agenda');
          } catch (e) { mostrarErro(e); }
        });
      },
      excluir: async (el) => {
        if (!await confirmar({ titulo: 'Excluir este serviço?', mensagem: 'Some do histórico e do financeiro. Não dá para desfazer.', confirmar: 'Excluir', perigo: true })) return;
        await comCarregando(el, async () => {
          try {
            await excluirAgendamentoCompleto(usuario.empresaId, linhas);
            toast('Serviço excluído.', 'sucesso');
            ir('/historico');
          } catch (e) { mostrarErro(e); }
        });
      },
    });
  }

  /** Só dá para adicionar serviço depois de escolher (ou cadastrar) o aparelho. */
  async function adicionarServico(el, base, abertas) {
    await comCarregando(el, async () => {
      try {
        const aparelhos = await listarAparelhosDoCliente(usuario.empresaId, base.clienteId).catch(() => []);
        const escolhaAparelho = await escolher({
          titulo: 'Em qual aparelho?',
          opcoes: [
            ...aparelhos.map((a) => ({ id: a.id, rotulo: resumoDoAparelho(a) })),
            { id: '__novo', rotulo: '+ Cadastrar aparelho novo' },
          ],
        });
        if (!escolhaAparelho) return;
        if (escolhaAparelho === '__novo') {
          ir(`/cliente/${encodeURIComponent(base.clienteId)}/aparelho/novo?voltar=1`);
          return;
        }
        const tipos = tiposAtivos();
        if (tipos.length === 0) { toast('Não há tipo de serviço ativo.', 'erro'); return; }
        const tipoId = await escolher({
          titulo: 'Qual serviço?',
          opcoes: tipos.map((t) => ({ id: t.id, rotulo: `${t.nome} · ${textoDoRetorno(t)}` })),
        });
        if (!tipoId) return;
        const referencia = abertas.find((l) => l.tecnicoUid === usuario.uid) || abertas[0] || base;
        await adicionarServicoNaVisita({
          empresaId: usuario.empresaId,
          base: referencia,
          aparelho: aparelhos.find((a) => a.id === escolhaAparelho),
          tipo: sessao.tipos.find((t) => t.id === tipoId),
          // O técnico que adiciona fica com o serviço; o administrador mantém o técnico da visita.
          tecnico: usuario.admin ? null : { uid: usuario.uid, nome: usuario.nome },
          linhasDaVisita: abertas,
        });
        toast('Serviço adicionado.', 'sucesso');
        ctx.recarregar();
      } catch (e) { mostrarErro(e); }
    });
  }

  await carregar();
  return () => desligar();
}
