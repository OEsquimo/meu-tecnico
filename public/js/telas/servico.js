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

import { html, mostrar, aoClicar, confirmar, comCarregando, toast, mostrarErro, escolher, pedirTexto } from '../nucleo/ui.js';
import { cabecalho, botao, selo, listaDeDados, esqueletos, aviso } from '../nucleo/componentes.js';
import { podeVerValores } from '../nucleo/permissoes.js';
import { sessao, tiposAtivos } from '../nucleo/sessao.js';
import {
  buscarServico, listarLinhasDoAgendamento, cancelarAgendamentoCompleto, excluirAgendamentoCompleto, excluirServico, editarDescricao, marcarPago, registrarCobranca, adicionarServicoNaVisita, corrigirServicoAdicionado, excluirServicoAdicionado, marcarIncluidosComoVistos, buscarValores,
} from '../servicos/servicos.js';
import { listarAparelhosDoCliente } from '../servicos/aparelhos.js';
import { seloDoServico, resumoDaVisita, STATUS, ehLinhaSemServico, precisaInformarAparelhoEServico, textoDosTecnicos, nomesDosTecnicos, servicoTemTecnico } from '../dominio/servicos.js';
import { resumoDoAparelho } from '../dominio/aparelhos.js';
import { formatarDataHoraBR, formatarDataBR } from '../dominio/datas.js';
import { formatarReais } from '../dominio/dinheiro.js';
import { formatarTelefone } from '../dominio/telefone.js';
import { linkWhatsappDoCliente } from '../dominio/whatsapp.js';
import { linhasCobraveis, montarCobranca, modeloDaEmpresa } from '../dominio/cobranca.js';
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
      // O administrador lê o valor; o técnico só se foi liberado ("Pode ver valores").
      const valores = {};
      if (podeVerValores(sessao)) {
        await Promise.all(linhas.filter((l) => l.status === STATUS.CONCLUIDO).map(async (l) => {
          valores[l.id] = await buscarValores(usuario.empresaId, l.id).catch(() => null);
        }));
      }
      if (!ctx.ativo()) return;
      desenhar(servico, linhas, valores);
      // O administrador abriu: o aviso de "incluído em campo" some do Início (sem atrapalhar a tela se falhar).
      if (usuario.admin) marcarIncluidosComoVistos(usuario.empresaId, linhas).catch(() => {});
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

  function cartaoDaLinha(l, valores, cobraveis) {
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
            <div class="item-lista__sub">${textoDosTecnicos(l) ? `${nomesDosTecnicos(l).length > 1 ? 'Técnicos' : 'Técnico'}: ${textoDosTecnicos(l)}` : 'Sem técnico'}</div>
          </div>
          ${!ehLinhaSemServico(l) && selo(textoDoRetorno(sessao.tipos.find((t) => t.id === l.tipoServicoId) || { geraRetorno: l.geraRetorno, retornoPadraoMeses: l.retornoMeses }), l.geraRetorno ? 'azul' : '')}
          ${selo(sit.texto, sit.tom)}
          ${l.adicionadoPeloTecnico === true && selo('Incluído pelo técnico')}
        </div>
        ${nota && html`<div class="visita-obs">${nota}</div>`}
        ${concluida && listaDeDados([
          ['Concluído em', formatarDataHoraBR(l.dataConclusao)],
          ['Por', l.concluidoPorNome],
          ['O que foi feito', l.descricao],
          ['Cliente pagou?', l.pago ? 'Sim' : 'Não'],
          ...linhasDeValor(valor),
          ['Garantia até', l.garantiaAte ? formatarDataBR(l.garantiaAte) : ''],
          ['Próximo retorno', l.dataRetorno ? formatarDataBR(l.dataRetorno) : ''],
        ])}
        ${concluida && usuario.admin && html`
          <div class="acoes-cartao">
            ${botao({ texto: l.pago ? 'Marcar como a receber' : 'Marcar como pago', variante: 'secundario', acao: 'alternar-pago', dados: { id: l.id }, pequeno: true })}
            ${botao({ texto: 'Editar', variante: 'secundario', iconeNome: 'editar', acao: 'editar-concluido', dados: { id: l.id }, pequeno: true })}
            ${botao({ texto: 'Excluir', variante: 'perigo', iconeNome: 'lixeira', acao: 'excluir-concluido', dados: { id: l.id }, pequeno: true })}
          </div>`}
        ${l.status === STATUS.CANCELADO && l.pendente === true && l.motivoPendencia && html`<div class="visita-obs">Motivo: ${l.motivoPendencia}</div>`}
        ${concluida && usuario.admin && l.cobradoEm && !l.pago && html`<div class="item-lista__sub">Cobrado em ${formatarDataBR(l.cobradoEm)}</div>`}
        ${concluida && usuario.admin && cobraveis.some((c) => c.id === l.id) && botao({ texto: 'Cobrar no WhatsApp', variante: 'whatsapp', iconeNome: 'whatsapp', acao: 'cobrar', dados: { ids: l.id }, pequeno: true })}
        ${concluida && usuario.admin ? html`<div class="acoes-cartao">${botao({ texto: valor ? 'Corrigir valor' : 'Informar valor', variante: 'secundario', pequeno: true, href: `#/servico/${l.id}/valor` })}</div>` : ''}
        ${concluida && usuario.admin && !valor ? aviso({ tom: 'amarelo', texto: 'Este serviço ainda não tem valor. Informe aqui ou em Financeiro > Concluídos sem valor.' }) : ''}
        ${agendada && (precisaInformarAparelhoEServico(l)
    ? botao({ texto: 'Informar aparelho e serviço', iconeNome: 'editar', href: `#/informar/${l.id}`, bloco: true })
    : botao({ texto: 'Concluir serviço', iconeNome: 'check', href: `#/concluir/${l.id}`, bloco: true }))}
        ${agendada && !usuario.admin && l.adicionadoPeloTecnico === true && html`
          <div class="acoes-cartao">
            ${botao({ texto: 'Editar', variante: 'secundario', iconeNome: 'editar', acao: 'editar-adicionado', dados: { id: l.id }, pequeno: true })}
            ${botao({ texto: 'Excluir', variante: 'perigo', iconeNome: 'lixeira', acao: 'excluir-adicionado', dados: { id: l.id }, pequeno: true })}
          </div>`}
      </div>`;
  }

  /** Linhas "Valor / Extras / Desconto / Total" para a lista de dados (vazio se não pode ver). */
  function linhasDeValor(valor) {
    if (!podeVerValores(sessao)) return [];
    if (!valor) return [['Valor', usuario.admin ? 'Ainda não informado' : 'Ainda não confirmado']];
    const itens = [['Valor do serviço', formatarReais(valor.baseCentavos)]];
    for (const e of valor.extras) itens.push([`Extra: ${e.descricao}`, formatarReais(e.valorCentavos)]);
    if (valor.descontoCentavos > 0) itens.push(['Desconto', `- ${formatarReais(valor.descontoCentavos)}`]);
    itens.push(['Total', formatarReais(valor.valorCentavos)]);
    return itens;
  }

  function desenhar(s, linhas, valores) {
    const totalDaVisita = linhas.reduce((t, l) => t + (valores[l.id]?.valorCentavos || 0), 0);
    const concluidasComValor = linhas.filter((l) => valores[l.id]).length;
    const abertas = linhas.filter((l) => l.status === STATUS.AGENDADO);
    const agendado = abertas.length > 0;
    // Cancelado (e nada mais aberto): espera uma nova data. Concluídos ficam sempre guardados.
    const canceladas = linhas.filter((l) => l.status === STATUS.CANCELADO);
    const aguardando = !agendado && canceladas.length > 0;
    const temConcluida = linhas.some((l) => l.status === STATUS.CONCLUIDO);
    const aguardandoSemConcluida = () => aguardando && !temConcluida;
    const situacao = agendado ? seloDoServico(abertas[0], new Date(), { curto: true }) : (aguardandoSemConcluida() ? seloDoServico(canceladas[0], new Date(), { curto: true }) : seloDoServico(linhas.find((l) => l.status === STATUS.CONCLUIDO) || linhas[0], new Date(), { curto: true }));
    const ligar = linkLigar(s.clienteWhatsapp);
    const whats = linkWhatsappDoCliente(s.clienteWhatsapp, '');
    const tecnicos = [...new Set(linhas.flatMap((l) => nomesDosTecnicos(l)).filter(Boolean))].join(', ');
    const observacao = s.obsAgendamento || '';
    const unico = linhas.length === 1 && !ehLinhaSemServico(linhas[0]);
    const grupos = porAparelho(linhas);
    const cobraveis = usuario.admin ? linhasCobraveis(linhas, valores) : [];
    // Se já há botão de cobrança (abre o WhatsApp do cliente com a mensagem pronta), o "WhatsApp" simples sai.
    const temCobranca = cobraveis.length > 0;
    const resumo = resumoDaVisita(linhas);
    const pendentes = canceladas.filter((l) => l.pendente === true);

    mostrar(raiz, html`
      ${cabecalho({ titulo: unico ? s.tipoServicoNome : 'Agendamento', voltarPara, acaoDireita: selo(situacao.texto, situacao.tom) })}
      <div class="pilha">
        <div class="cartao">
          ${listaDeDados([
            ['Quando', formatarDataHoraBR(s.dataAgendada)],
            ['Cliente', s.clienteNome],
            ['Telefone', s.clienteWhatsapp ? formatarTelefone(s.clienteWhatsapp) : ''],
            ['Local', s.local],
            ['Técnicos', tecnicos],
            ['Observação', observacao],
            ...(pendentes.length > 0 && temConcluida ? [['Situação da visita', resumo]] : []),
            ...(podeVerValores(sessao) && concluidasComValor > 1 ? [['Total da visita', formatarReais(totalDaVisita)]] : []),
          ])}
          ${botao({ texto: 'Ir até o cliente', variante: 'secundario', iconeNome: 'navegar', acao: 'navegar', bloco: true })}
          <div class="acoes-cartao">
            ${ligar ? botao({ texto: 'Ligar', variante: 'secundario', iconeNome: 'telefone', href: ligar, pequeno: true }) : ''}
            ${whats && !temCobranca ? botao({ texto: 'WhatsApp', variante: 'whatsapp', iconeNome: 'whatsapp', href: whats, externo: true, pequeno: true }) : ''}
          </div>
        </div>

        ${aguardando && aviso({ tom: 'amarelo', texto: pendentes.length > 0 ? 'Há serviço pendente nesta visita. Toque em Editar e escolha uma nova data para ele, ou exclua se não for mais acontecer.' : 'Este agendamento foi cancelado. Toque em Editar e escolha uma nova data para reagendar, ou exclua se não for mais acontecer.' })}
        ${cobraveis.length > 1 && botao({ texto: 'Cobrar tudo desta visita', variante: 'whatsapp', iconeNome: 'whatsapp', acao: 'cobrar', dados: { ids: cobraveis.map((c) => c.id).join(',') }, bloco: true })}
        ${tituloSecao('Aparelhos e serviços')}
        ${grupos.map(([aparelhoId, lista]) => html`
          <section class="cartao visita-aparelho">
            <div>
              <div class="item-lista__titulo">${aparelhoId ? (lista[0].aparelhoResumo || 'Aparelho') : 'Aparelho ainda não escolhido'}</div>
              ${!aparelhoId && html`<div class="item-lista__sub">Escolha ou cadastre o aparelho ao concluir o serviço.</div>`}
              ${lista[0].obsAparelho && html`<div class="visita-obs">${lista[0].obsAparelho}</div>`}
            </div>
            ${lista.map((l) => cartaoDaLinha(l, valores, cobraveis))}
          </section>`)}

        ${agendado ? botao({ texto: 'Adicionar serviço na visita', variante: 'secundario', iconeNome: 'mais', acao: 'adicionar-servico', bloco: true }) : ''}
        ${usuario.admin && (agendado || aguardando) ? html`
          <div class="acoes-cartao">
            ${botao({ texto: 'Editar', variante: 'secundario', iconeNome: 'editar', href: `#/servico/${s.id}/editar`, pequeno: true })}
            ${agendado ? botao({ texto: 'Cancelar', variante: 'secundario', acao: 'cancelar', pequeno: true }) : ''}
            ${botao({ texto: 'Excluir', variante: 'perigo', iconeNome: 'lixeira', acao: 'excluir', pequeno: true })}
          </div>` : ''}
        ${usuario.admin && temConcluida ? html`<p class="texto-suave texto-pequeno">Serviço concluído é registro e garantia: o administrador só corrige o que está errado, e excluir pede confirmação dupla.</p>` : ''}
      </div>`);

    desligar();
    // Depois de excluir: se ainda sobrou serviço na visita, continua nela (usando um serviço que existe);
    // se não sobrou nada, vai para o Início. Evita recarregar o endereço de um serviço já apagado.
    function seguirDepoisDeExcluir(idsExcluidos) {
      const restantes = linhas.filter((l) => !idsExcluidos.includes(l.id));
      if (restantes.length === 0) { ir('/'); return; }
      if (restantes.some((l) => l.id === s.id)) { ctx.recarregar(); return; }
      ir(`/servico/${encodeURIComponent(restantes[0].id)}`, { substituir: true });
    }

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
      'editar-adicionado': (el) => comCarregando(el, async () => {
        try {
          const linha = linhas.find((l) => l.id === el.dataset.id);
          if (!linha) return;
          const jaTem = linhas.filter((l) => l.id !== linha.id && l.aparelhoId === linha.aparelhoId && l.status === STATUS.AGENDADO).map((l) => l.tipoServicoId);
          const tipos = tiposAtivos().filter((t) => !jaTem.includes(t.id));
          if (tipos.length === 0) { toast('Não há outro tipo de serviço disponível.', 'erro'); return; }
          const tipoId = await escolher({ titulo: 'Trocar para qual serviço?', opcoes: tipos.map((t) => ({ id: t.id, rotulo: `${t.nome} · ${textoDoRetorno(t)}` })) });
          if (!tipoId || tipoId === linha.tipoServicoId) return;
          await corrigirServicoAdicionado({ empresaId: usuario.empresaId, servico: linha, tipo: sessao.tipos.find((t) => t.id === tipoId) });
          toast('Serviço corrigido.', 'sucesso');
          ctx.recarregar();
        } catch (e) { mostrarErro(e); }
      }),
      'excluir-adicionado': (el) => comCarregando(el, async () => {
        try {
          const linha = linhas.find((l) => l.id === el.dataset.id);
          if (!linha) return;
          // O único serviço aberto da visita não sai por aqui: sumiria o agendamento do administrador.
          if (linhas.filter((l) => l.status === STATUS.AGENDADO).length <= 1) {
            toast('Este é o único serviço da visita. Se não deu para fazer, use "Não deu para fazer".', 'erro');
            return;
          }
          if (!await confirmar({ titulo: 'Excluir este serviço?', mensagem: 'Ele sai do agendamento. O cliente e os outros serviços não são afetados.', confirmar: 'Excluir serviço', cancelar: 'Voltar', perigo: true })) return;
          await excluirServicoAdicionado(usuario.empresaId, linha);
          toast('Serviço excluído.', 'sucesso');
          seguirDepoisDeExcluir([linha.id]);
        } catch (e) { mostrarErro(e); }
      }),
      'editar-concluido': async (el) => {
        const linha = linhas.find((l) => l.id === el.dataset.id);
        const texto = await pedirTexto({ titulo: 'O que foi feito?', rotulo: 'Descreva o serviço', valor: linha.descricao || '', multilinha: true, maximo: 2000, confirmar: 'Salvar' });
        if (texto === null) return;
        await comCarregando(el, async () => {
          try {
            await editarDescricao(usuario.empresaId, linha.id, texto);
            toast('Descrição corrigida.', 'sucesso');
            ctx.recarregar();
          } catch (e) { mostrarErro(e); }
        });
      },
      'excluir-concluido': async (el) => {
        const linha = linhas.find((l) => l.id === el.dataset.id);
        if (!await confirmar({ titulo: 'Excluir este serviço concluído?', mensagem: `"${linha.tipoServicoNome}" sai do histórico e do financeiro (o valor também é apagado). Ele era registro e garantia do cliente.`, confirmar: 'Continuar', cancelar: 'Voltar', perigo: true })) return;
        if (!await confirmar({ titulo: 'Tem certeza?', mensagem: 'Não dá para desfazer. O cliente e os aparelhos dele não são apagados.', confirmar: 'Excluir de vez', cancelar: 'Voltar', perigo: true })) return;
        await comCarregando(el, async () => {
          try {
            await excluirServico(usuario.empresaId, linha.id, { permitirConcluido: true });
            toast('Serviço excluído.', 'sucesso');
            seguirDepoisDeExcluir([linha.id]);
          } catch (e) { mostrarErro(e); }
        });
      },
      cobrar: (el) => {
        const ids = String(el.dataset.ids || '').split(',').filter(Boolean);
        const itens = cobraveis.filter((l) => ids.includes(l.id));
        if (itens.length === 0) return;
        const e = sessao.empresa || {};
        const texto = montarCobranca(modeloDaEmpresa(e), {
          nome: String(s.clienteNome || '').split(' ')[0], empresa: e.nome, pix: e.chavePix,
          itens: itens.map((l) => ({ servico: l.tipoServicoNome, aparelho: l.aparelhoResumo, data: l.dataConclusao, centavos: valores[l.id].valorCentavos })),
        });
        const link = linkWhatsappDoCliente(s.clienteWhatsapp, texto);
        if (!link) { toast('Este cliente não tem WhatsApp cadastrado.', 'erro'); return; }
        window.open(link, '_blank', 'noopener');
        registrarCobranca(usuario.empresaId, ids).then(() => ctx.recarregar()).catch(mostrarErro);
      },
      'adicionar-servico': (el) => adicionarServico(el, s, abertas),
      cancelar: async (el) => {
        if (!await confirmar({ titulo: 'Cancelar este agendamento?', mensagem: 'Ele fica "aguardando reagendamento" para você marcar outra data. O cliente não será avisado automaticamente.', confirmar: 'Cancelar agendamento', cancelar: 'Voltar', perigo: true })) return;
        await comCarregando(el, async () => {
          try {
            await cancelarAgendamentoCompleto(usuario.empresaId, linhas);
            toast('Agendamento cancelado.', 'sucesso');
            ir('/agenda');
          } catch (e) { mostrarErro(e); }
        });
      },
      excluir: async (el) => {
        if (!await confirmar({ titulo: 'Excluir este agendamento?', mensagem: 'Apaga os dados deste agendamento. Não apaga o cliente, os aparelhos dele nem serviços já concluídos. Não dá para desfazer.', confirmar: 'Excluir agendamento', cancelar: 'Voltar', perigo: true })) return;
        await comCarregando(el, async () => {
          try {
            await excluirAgendamentoCompleto(usuario.empresaId, linhas);
            toast('Agendamento excluído.', 'sucesso');
            seguirDepoisDeExcluir(linhas.filter((l) => l.status !== STATUS.CONCLUIDO).map((l) => l.id));
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
          ir(`/cliente/${encodeURIComponent(base.clienteId)}/aparelho/novo?voltar=1&endereco=${encodeURIComponent(base.enderecoId || '')}`);
          return;
        }
        // O mesmo serviço não entra duas vezes no mesmo aparelho da visita.
        const jaTem = abertas.filter((l) => l.aparelhoId === escolhaAparelho).map((l) => l.tipoServicoId);
        const tipos = tiposAtivos().filter((t) => !jaTem.includes(t.id));
        if (tipos.length === 0) { toast(tiposAtivos().length === 0 ? 'Não há tipo de serviço ativo.' : 'Este aparelho já tem todos os serviços disponíveis nesta visita.', 'erro'); return; }
        const tipoId = await escolher({
          titulo: 'Qual serviço?',
          opcoes: tipos.map((t) => ({ id: t.id, rotulo: `${t.nome} · ${textoDoRetorno(t)}` })),
        });
        if (!tipoId) return;
        const referencia = abertas.find((l) => servicoTemTecnico(l, usuario.uid)) || abertas[0] || base;
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
