// =============================================================================
// TELA: Agendar serviço / Editar agendamento (só administrador)
// =============================================================================
// Rotas: /agendar  e  /servico/:id/editar
// Parâmetros opcionais na consulta (usados por Retornos, Cliente e Agenda):
//   ?cliente=ID  ?aparelho=ID  ?tipo=ID  ?data=AAAA-MM-DD
//   ?retorno=ID  -> ID do serviço de ORIGEM do lembrete de retorno; ao agendar,
//                   o lembrete passa a "agendado" (origemRetornoId).
//
// REGRAS DESTA TELA
//   * UM dia e UMA hora por agendamento (dá para mudar depois).
//   * Pode agendar só com cliente, dia, hora e técnico. Aparelhos e serviços
//     são opcionais aqui; o aparelho passa a ser obrigatório na CONCLUSÃO.
//   * Cartões: um por aparelho e, dentro dele, um por serviço. Só dá para
//     adicionar serviço depois que o aparelho está no cartão.
//   * Cada serviço tem o seu técnico. Só aparecem na lista os técnicos LIVRES
//     naquele dia e horário (o mesmo técnico pode fazer vários serviços da
//     visita: os tempos se somam). Sem técnico livre: aviso e botão bloqueado.
//   * Cliente, aparelhos e serviços podem ser editados/removidos aqui. "Remover"
//     tira só deste agendamento; excluir o cadastro é na ficha do cliente.
// =============================================================================

import { html, mostrar, aoClicar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, esperarDigitar, toast, escolher, levarAte } from '../nucleo/ui.js';
import { cabecalho, botao, aviso, avatar, estadoVazio, esqueletos, campoTexto, campoTextoLongo, campoSelecao, campoPilulas, selo } from '../nucleo/componentes.js';
import { sessao, tiposAtivos } from '../nucleo/sessao.js';
import { traduzirErro } from '../nucleo/erros.js';
import { listarClientes, buscarCliente } from '../servicos/clientes.js';
import { listarAparelhosDoCliente } from '../servicos/aparelhos.js';
import { tecnicosParaAtribuir } from '../servicos/equipe.js';
import { buscarServico, listarAgendados, listarLinhasDoAgendamento, salvarAgendamento } from '../servicos/servicos.js';
import { filtrarClientes, enderecoDoCliente } from '../dominio/clientes.js';
import { validarAgendamento } from '../dominio/validacoes.js';
import { resumoDoAparelho, tituloDoAparelho, descricaoTecnica } from '../dominio/aparelhos.js';
import { linhaCurtaDoEndereco } from '../dominio/endereco.js';
import { formatarTelefone } from '../dominio/telefone.js';
import { ehISOValido, formatarDataHoraBR, formatarDataBR, hojeISO, paraISO, formatarHora } from '../dominio/datas.js';
import { STATUS, chaveDoAgendamento } from '../dominio/servicos.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar, mostrarNaoEncontrado } from './servicos-comum.js';
import {
  estadoInicial, novoGrupo, novoServico, inicioDoEstado, todosOsServicos, textoDoRetorno, duracaoDoTipo, duracaoDoServicoNaTela,
  DURACOES_OFERECIDAS, textoDaDuracao, problemasDoAgendamento,
  tecnicosLivresParaServico, tecnicosLivresParaAgendamento, limparTecnicosOcupados, tecnicoSugerido,
  pendenciasDoAgendamento, montarLinhas, estadoDeLinhas, guardarRascunho, pegarRascunho, descartarRascunho,
} from './agendamento-comum.js';

const MAXIMO_RESULTADOS = 8;

export default async function montar(ctx) {
  const { raiz, params, consulta } = ctx;
  const usuario = contextoDoUsuario();
  const editando = Boolean(params.id);
  const titulo = editando ? 'Editar agendamento' : 'Agendar serviço';
  const topo = cabecalho({ titulo, voltarPara: true });
  let desligar = () => {};
  let ouvintes = [];

  let estado = estadoInicial({ data: hojeISO() });
  let servico = null; // serviço aberto na rota de edição
  let servicoComErro = null; // chave do cartão de serviço destacado em vermelho (falta o técnico)
  let linhasPreservadas = []; // ids de linhas abertas que não dá para mostrar (aparelho/tipo excluído)
  let linhasExistentes = []; // todas as linhas do agendamento em edição
  let agendamentoId = null;
  let origemRetornoId = null;
  let todosClientes = [];
  let tecnicos = []; // { uid, nome }
  let aparelhos = []; // aparelhos do cliente escolhido
  let ocupacao = []; // serviços agendados em volta do dia escolhido
  let contadorOcupacao = 0;

  const tiposPorId = () => Object.fromEntries(sessao.tipos.map((t) => [t.id, t]));
  const aparelhosPorId = () => Object.fromEntries(aparelhos.map((a) => [a.id, a]));
  const tecnicosPorUid = () => Object.fromEntries(tecnicos.map((t) => [t.uid, {
    uid: t.uid,
    // O administrador aparece na lista como "Nome (eu)"; dentro do serviço guardamos só o nome.
    nome: t.uid === usuario.uid ? (usuario.nome || 'Administrador') : t.nome,
  }]));
  const contexto = () => ({ estado, tecnicos, tiposPorId: tiposPorId(), agendados: ocupacao, agendamentoId });

  // ---------------------------------------------------------------------------
  // Carregamento
  // ---------------------------------------------------------------------------
  async function carregar() {
    mostrar(raiz, html`${topo}${esqueletos(3)}`);
    try {
      await carregarEstilos();
      [todosClientes, tecnicos] = await Promise.all([
        listarClientes(usuario.empresaId),
        tecnicosParaAtribuir(usuario.empresaId, { uid: usuario.uid, nome: usuario.nome }),
      ]);
      estado.tecnicoUid = '';

      const rascunho = pegarRascunho();
      if (rascunho && (rascunho.extras.editandoId || null) === (params.id || null)) {
        await restaurarRascunho(rascunho);
      } else if (editando) {
        await carregarParaEditar();
        if (!servico) return;
      } else {
        await preencherPelaConsulta();
      }
      // Técnico que saiu da equipe continua aparecendo neste agendamento.
      for (const l of linhasExistentes) {
        if (l.tecnicoUid && !tecnicos.some((t) => t.uid === l.tecnicoUid)) tecnicos.push({ uid: l.tecnicoUid, nome: l.tecnicoNome || 'Técnico' });
      }
      if (estado.cliente) await carregarAparelhos();
      linhasPreservadas = linhasExistentes
        .filter((l) => l.status === STATUS.AGENDADO
          && ((l.aparelhoId && !aparelhos.some((a) => a.id === l.aparelhoId)) || (l.tipoServicoId && !sessao.tipos.some((t) => t.id === l.tipoServicoId))))
        .map((l) => l.id);
      await carregarOcupacao({ avisar: false });
      sugerirTecnicoDoAgendamento();
      // Serviços que já chegam preenchidos (retorno, ficha do cliente) recebem um técnico livre.
      for (const s of todosOsServicos(estado)) {
        if (!s.tecnicoUid) s.tecnicoUid = tecnicoSugerido({ ...contexto(), servico: s });
      }
      if (!ctx.ativo()) return;
      desenhar();
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, topo);
    }
  }

  async function carregarParaEditar() {
    servico = await buscarServico(usuario.empresaId, params.id);
    if (!servico) { mostrarNaoEncontrado(raiz, 'Serviço não encontrado', 'Ele pode ter sido excluído.', '#/agenda'); return; }
    if (servico.status !== STATUS.AGENDADO) {
      servico = null;
      mostrarNaoEncontrado(raiz, 'Não dá para editar', 'Só serviços que ainda estão agendados podem ser editados.', `#/servico/${encodeURIComponent(params.id)}`);
      return;
    }
    agendamentoId = chaveDoAgendamento(servico);
    linhasExistentes = await listarLinhasDoAgendamento(usuario.empresaId, servico);
    const cliente = todosClientes.find((c) => c.id === servico.clienteId) || await buscarCliente(usuario.empresaId, servico.clienteId);
    estado = estadoDeLinhas(linhasExistentes, {
      cliente, data: paraISO(servico.dataAgendada), hora: formatarHora(servico.dataAgendada),
      tipoExiste: (id) => sessao.tipos.some((t) => t.id === id),
    });
    if (!estado.tecnicoUid) estado.tecnicoUid = servico.tecnicoUid || '';
  }

  /** Volta de "Editar cliente / aparelho / Novo aparelho": devolve o que já estava preenchido. */
  async function restaurarRascunho(rascunho) {
    estado = rascunho.estado;
    origemRetornoId = rascunho.extras.origemRetornoId || null;
    if (editando) {
      servico = await buscarServico(usuario.empresaId, params.id);
      if (!servico) { mostrarNaoEncontrado(raiz, 'Serviço não encontrado', 'Ele pode ter sido excluído.', '#/agenda'); return; }
      agendamentoId = chaveDoAgendamento(servico);
      linhasExistentes = await listarLinhasDoAgendamento(usuario.empresaId, servico);
    }
    if (estado.cliente) {
      // O cliente pode ter sido editado: pega a ficha atualizada.
      estado.cliente = await buscarCliente(usuario.empresaId, estado.cliente.id).catch(() => estado.cliente) || estado.cliente;
    }
    const conhecidos = new Set(rascunho.extras.aparelhosConhecidos || []);
    if (estado.cliente) {
      const atuais = await listarAparelhosDoCliente(usuario.empresaId, estado.cliente.id).catch(() => []);
      const idsAtuais = new Set(atuais.map((a) => a.id));
      // Aparelho excluído enquanto estava fora: sai dos cartões.
      estado.grupos = estado.grupos.filter((g) => g.aparelhoId === '' || idsAtuais.has(g.aparelhoId));
      // Aparelho recém-cadastrado: entra sozinho como cartão novo.
      for (const a of atuais) {
        if (!conhecidos.has(a.id) && !estado.grupos.some((g) => g.aparelhoId === a.id)) estado.grupos.push(novoGrupo(a.id));
      }
    }
  }

  /** Aplica ?cliente= &aparelho= &tipo= &data= &retorno= (cada um é opcional e conferido). */
  async function preencherPelaConsulta() {
    let origem = null;
    const retorno = consulta.get('retorno');
    if (retorno) {
      origem = await buscarServico(usuario.empresaId, retorno).catch(() => null);
      if (origem) origemRetornoId = origem.id;
    }
    const clienteId = consulta.get('cliente') || origem?.clienteId || '';
    if (clienteId) {
      estado.cliente = todosClientes.find((c) => c.id === clienteId) || await buscarCliente(usuario.empresaId, clienteId).catch(() => null);
    }
    if (estado.cliente) {
      estado.enderecoId = origem?.enderecoId || '';
      const aparelhoId = consulta.get('aparelho') || origem?.aparelhoId || '';
      const tipoId = consulta.get('tipo') || origem?.tipoServicoId || '';
      if (aparelhoId) {
        const lista = await listarAparelhosDoCliente(usuario.empresaId, estado.cliente.id).catch(() => []);
        if (lista.some((a) => a.id === aparelhoId)) {
          const g = novoGrupo(aparelhoId);
          if (tipoId && sessao.tipos.some((t) => t.id === tipoId)) g.servicos.push(novoServico({ tipoId }));
          estado.grupos.push(g);
        }
      }
    }
    const data = consulta.get('data');
    if (data && ehISOValido(data)) estado.data = data;
  }

  /** Busca os aparelhos do cliente escolhido e acerta o endereço. */
  async function carregarAparelhos() {
    aparelhos = estado.cliente ? await listarAparelhosDoCliente(usuario.empresaId, estado.cliente.id).catch(() => []) : [];
    const enderecos = estado.cliente?.enderecos || [];
    if (!enderecos.some((e) => e.id === estado.enderecoId)) {
      const doPrimeiro = estado.grupos.map((g) => aparelhos.find((a) => a.id === g.aparelhoId)?.enderecoId).find((id) => id && enderecos.some((e) => e.id === id));
      estado.enderecoId = doPrimeiro || enderecos[0]?.id || '';
    }
    // Serviços que apontavam para técnico/tipo inexistente não quebram a tela.
    estado.grupos = estado.grupos.filter((g) => g.aparelhoId === '' || aparelhos.some((a) => a.id === g.aparelhoId));
  }

  /** Lê, no banco, quem já está ocupado em volta do dia escolhido. */
  async function carregarOcupacao({ avisar = true } = {}) {
    const inicio = inicioDoEstado(estado);
    if (!inicio) { ocupacao = []; return; }
    const meu = ++contadorOcupacao;
    const lista = await listarAgendados({ empresaId: usuario.empresaId, de: new Date(inicio.getTime() - 24 * 3600000), ate: new Date(inicio.getTime() + 24 * 3600000) });
    if (meu !== contadorOcupacao) return; // chegou resposta mais nova
    ocupacao = lista;
    const perdidos = limparTecnicosOcupados(contexto());
    if (avisar && perdidos > 0) {
      toast(`${perdidos === 1 ? 'Um técnico já está' : `${perdidos} técnicos já estão`} ocupado${perdidos === 1 ? '' : 's'} nesse horário. Escolha de novo.`, 'erro');
    }
  }

  /** Agendamento novo sem técnico: já deixa o primeiro técnico livre escolhido (dá para trocar). */
  function sugerirTecnicoDoAgendamento() {
    if (estado.tecnicoUid) return;
    estado.tecnicoUid = tecnicosLivresParaAgendamento(contexto())[0]?.uid || '';
  }

  // ---------------------------------------------------------------------------
  // Desenho
  // ---------------------------------------------------------------------------
  function limparLigacoes() {
    desligar();
    for (const [alvo, tipo, f] of ouvintes) alvo.removeEventListener(tipo, f);
    ouvintes = [];
  }

  function ouvir(alvo, tipo, f) {
    alvo.addEventListener(tipo, f);
    ouvintes.push([alvo, tipo, f]);
  }

  function desenhar() {
    limparLigacoes();
    if (todosClientes.length === 0 && !estado.cliente) {
      mostrar(raiz, html`${topo}${estadoVazio({
        icone: 'clientes', titulo: 'Cadastre um cliente primeiro', texto: 'Para agendar um serviço, o cliente precisa estar cadastrado.',
        acao: botao({ texto: 'Novo cliente', iconeNome: 'mais', href: '#/cliente/novo' }),
      })}`);
      return;
    }
    mostrar(raiz, html`
      ${topo}
      <form id="form-agendar" class="formulario" novalidate>
        <div data-erros-gerais></div>
        <div id="area-cliente" class="pilha"></div>
        <div id="area-aparelhos" class="pilha"></div>
        <div class="grade-2">
          ${campoTexto({ nome: 'data', rotulo: 'Dia', tipo: 'date', valor: estado.data })}
          ${campoTexto({ nome: 'hora', rotulo: 'Hora', tipo: 'time', valor: estado.hora })}
        </div>
        <div id="area-tecnico"></div>
        <div id="area-obs-agendamento"></div>
        <div id="area-pendencias" class="pilha pilha--pequena"></div>
        ${botao({ texto: editando ? 'Salvar alterações' : 'Agendar', tipo: 'submit', bloco: true, id: 'botao-salvar' })}
      </form>`);
    desenharCliente();
    desenharAparelhos();
    desenharTecnico();
    desenharObsAgendamento();
    desenharPendencias();

    const form = raiz.querySelector('#form-agendar');
    aoEnviar(form, () => enviar(form));
    ligarEventosDoFormulario(form);
  }

  // ---- Observações recolhidas (abrem com um toque) ----
  /**
   * Observação que fica recolhida (só um botão) até o usuário tocar. Se já tem texto,
   * ela abre sozinha para ninguém esquecer que existe uma observação.
   */
  function observacaoRecolhivel({ nome, rotulo, valor, aberta, tipo, chave = '', maximo = 500, placeholder = '' }) {
    if (aberta) {
      return html`
        <div class="obs-recolhivel">
          ${campoTextoLongo({ nome, rotulo, opcional: true, valor, maximo, linhas: 2, placeholder })}
          ${botao({ texto: 'Recolher observação', variante: 'fantasma', pequeno: true, acao: 'alternar-obs', dados: { tipo, chave } })}
        </div>`;
    }
    return html`
      <div class="obs-recolhivel">
        <button type="button" class="obs-recolhivel__botao ${valor ? 'obs-recolhivel__botao--preenchida' : ''}" data-acao="alternar-obs" data-tipo="${tipo}" data-chave="${chave}">
          ${valor ? 'Observação (preenchida)' : '+ Observação'}
        </button>
      </div>`;
  }

  function desenharObsAgendamento() {
    const area = raiz.querySelector('#area-obs-agendamento');
    if (!area) return;
    mostrar(area, observacaoRecolhivel({
      nome: 'observacao', rotulo: 'Observação para o técnico', valor: estado.observacao, aberta: estado.obsAberta,
      tipo: 'agendamento', maximo: 2000, placeholder: 'Ex.: levar escada, avisar antes de chegar',
    }));
  }

  /** Abre/recolhe uma observação e, ao abrir, já coloca o cursor nela. */
  function alternarObservacao(tipo, chave) {
    let alvo;
    let nome;
    if (tipo === 'agendamento') { alvo = estado; nome = 'observacao'; }
    else if (tipo === 'grupo') { alvo = acharGrupo(chave); nome = `obsAparelho-${chave}`; }
    else { alvo = acharServico(chave); nome = `obsServico-${chave}`; }
    if (!alvo) return;
    alvo.obsAberta = !alvo.obsAberta;
    if (tipo === 'agendamento') desenharObsAgendamento(); else desenharAparelhos();
    if (alvo.obsAberta) levarAte(raiz.querySelector(`textarea[name="${nome}"]`));
  }

  // ---- Cliente ----
  function desenharCliente() {
    const area = raiz.querySelector('#area-cliente');
    const c = estado.cliente;
    if (!c) {
      mostrar(area, html`
        <div class="campo" data-campo="clienteId">
          <label class="campo__rotulo" for="campo-busca">Cliente</label>
          <input class="campo__entrada" id="campo-busca" type="search" placeholder="Digite nome, telefone ou rua" autocomplete="off" />
        </div>
        <div id="area-resultados" class="pilha pilha--pequena"></div>`);
      desenharResultados('');
      const entrada = area.querySelector('#campo-busca');
      const filtrar = esperarDigitar(() => desenharResultados(entrada.value));
      ouvir(entrada, 'input', filtrar);
      return;
    }
    const enderecos = c.enderecos || [];
    mostrar(area, html`
      <div class="campo" data-campo="clienteId">
        <span class="campo__rotulo">Cliente</span>
        <div class="cliente-escolhido">
          ${avatar(c.nome)}
          <div class="expande">
            <div class="item-lista__titulo">${c.nome}</div>
            <div class="item-lista__sub">${formatarTelefone(c.whatsapp)}</div>
          </div>
          ${botao({ texto: 'Editar', variante: 'secundario', pequeno: true, acao: 'editar-cliente' })}
          ${!editando && botao({ texto: 'Trocar', variante: 'secundario', pequeno: true, acao: 'trocar-cliente' })}
        </div>
      </div>
      ${enderecos.length > 1 && campoPilulas({
    nome: 'enderecoId', rotulo: 'Endereço',
    opcoes: enderecos.map((e, i) => ({ valor: e.id, rotulo: [e.apelido || `Endereço ${i + 1}`, linhaCurtaDoEndereco(e)].filter(Boolean).join(' · ') })),
    valor: estado.enderecoId,
  })}`);
  }

  function desenharResultados(termo) {
    const area = raiz.querySelector('#area-resultados');
    if (!area) return;
    const lista = filtrarClientes(todosClientes, termo);
    if (lista.length === 0) {
      mostrar(area, html`<p class="texto-suave">Nenhum cliente encontrado. <a href="#/cliente/novo">Cadastrar novo cliente</a></p>`);
      return;
    }
    mostrar(area, html`
      ${lista.slice(0, MAXIMO_RESULTADOS).map((c) => html`
        <button type="button" class="cliente-resultado" data-acao="escolher-cliente" data-id="${c.id}">
          ${avatar(c.nome)}
          <span class="expande">
            <span class="item-lista__titulo">${c.nome}</span><br />
            <span class="item-lista__sub">${[formatarTelefone(c.whatsapp), linhaCurtaDoEndereco(c.enderecos?.[0])].filter(Boolean).join(' · ')}</span>
          </span>
        </button>`)}
      ${lista.length > MAXIMO_RESULTADOS && html`<p class="texto-suave texto-pequeno">Mostrando ${MAXIMO_RESULTADOS} de ${lista.length}. Digite mais letras para achar o cliente.</p>`}`);
  }

  // ---- Aparelhos e serviços (cartões) ----
  function desenharAparelhos() {
    const area = raiz.querySelector('#area-aparelhos');
    if (!area) return;
    if (!estado.cliente) { mostrar(area, ''); return; }
    const total = todosOsServicos(estado).length;
    const mapa = aparelhosPorId();
    mostrar(area, html`
      <div class="agenda-secao">
        <span class="campo__rotulo">Aparelhos e serviços <span class="campo__opcional">(opcional)</span></span>
        ${estado.grupos.length > 0 && html`<span class="agenda-secao__resumo">${estado.grupos.length} ${estado.grupos.length === 1 ? 'aparelho' : 'aparelhos'} · ${total} ${total === 1 ? 'serviço' : 'serviços'}</span>`}
      </div>
      ${estado.grupos.length === 0 && html`<p class="campo__ajuda">Se quiser, já inclua os aparelhos e serviços. Dá para fazer isso depois, e o técnico também pode completar no atendimento.</p>`}
      ${estado.grupos.map((g) => cartaoDoAparelho(g, mapa[g.aparelhoId]))}
      <div class="acoes-cartao agenda-adicionar">
        ${botao({ texto: '+ Aparelho do cliente', variante: 'secundario', acao: 'adicionar-aparelho', pequeno: true })}
        ${botao({ texto: '+ Novo aparelho', variante: 'secundario', acao: 'novo-aparelho', pequeno: true })}
      </div>`);
  }

  function cartaoDoAparelho(g, aparelho) {
    const semCadastro = g.aparelhoId === '';
    return html`
      <section class="cartao agenda-aparelho" data-grupo="${g.chave}">
        <header class="agenda-aparelho__topo">
          <div class="expande">
            <div class="item-lista__titulo">${semCadastro ? 'Sem aparelho cadastrado' : tituloDoAparelho(aparelho)}</div>
            <div class="item-lista__sub">${semCadastro ? 'Escolha ou cadastre o aparelho na conclusão do serviço.' : descricaoTecnica(aparelho)}</div>
          </div>
          <div class="agenda-acoes">
            ${!semCadastro && botao({ texto: 'Editar', variante: 'secundario', pequeno: true, acao: 'editar-aparelho', dados: { grupo: g.chave } })}
            ${botao({ texto: 'Remover', variante: 'perigo', pequeno: true, acao: 'remover-aparelho', dados: { grupo: g.chave } })}
          </div>
        </header>
        <div class="pilha pilha--pequena">
          ${g.servicos.map((s) => cartaoDoServico(g, s))}
        </div>
        ${!semCadastro && botao({ texto: 'Adicionar serviço neste aparelho', variante: 'secundario', iconeNome: 'mais', bloco: true, acao: 'adicionar-servico', dados: { grupo: g.chave } })}
        ${observacaoRecolhivel({ nome: `obsAparelho-${g.chave}`, rotulo: 'Observações do aparelho', valor: g.obs, aberta: g.obsAberta, tipo: 'grupo', chave: g.chave })}
      </section>`;
  }

  function cartaoDoServico(g, s) {
    const tipo = tiposPorId()[s.tipoId];
    const livres = tecnicosLivresParaServico({ ...contexto(), servico: s });
    const opcoes = livres.map((t) => ({ valor: t.uid, rotulo: t.nome }));
    const duracao = duracaoDoServicoNaTela(s, tiposPorId());
    const ajustada = Boolean(s.duracaoMin) && s.duracaoMin !== duracaoDoTipo(tipo);
    return html`
      <div class="agenda-servico ${servicoComErro === s.chave ? 'agenda-servico--erro' : ''}" data-servico="${s.chave}">
        <div class="agenda-servico__topo">
          <div class="expande">
            <div class="item-lista__titulo">${tipo?.nome || 'Serviço'}</div>
            <div class="item-lista__sub">${textoDaDuracao(duracao)}${ajustada ? ' (ajustada)' : ''}</div>
            <div class="agenda-servico__selos">${selo(textoDoRetorno(tipo), tipo?.geraRetorno ? 'azul' : '')}</div>
          </div>
          <div class="agenda-acoes">
            ${botao({ texto: 'Editar', variante: 'secundario', pequeno: true, acao: 'editar-servico', dados: { servico: s.chave } })}
            ${botao({ texto: 'Remover', variante: 'perigo', pequeno: true, acao: 'remover-servico', dados: { servico: s.chave } })}
          </div>
        </div>
        ${opcoes.length === 0
    ? html`<div data-campo="tec-${s.chave}">${aviso({ tom: 'amarelo', texto: 'Nenhum técnico está livre nesse dia e horário. Mude o dia ou a hora.' })}</div>`
    : campoSelecao({ nome: `tec-${s.chave}`, rotulo: 'Técnico', opcoes, valor: s.tecnicoUid, vazio: s.tecnicoUid ? '' : 'Escolha o técnico' })}
        ${observacaoRecolhivel({ nome: `obsServico-${s.chave}`, rotulo: 'Observações do serviço', valor: s.obs, aberta: s.obsAberta, tipo: 'servico', chave: s.chave })}
      </div>`;
  }

  // ---- Técnico do agendamento ----
  function desenharTecnico() {
    const area = raiz.querySelector('#area-tecnico');
    if (!area) return;
    const livres = tecnicosLivresParaAgendamento(contexto());
    const inicio = inicioDoEstado(estado);
    const temServicos = todosOsServicos(estado).length > 0;
    if (!inicio) { mostrar(area, ''); return; }
    mostrar(area, livres.length === 0
      ? aviso({ tom: 'amarelo', titulo: 'Nenhum técnico livre', texto: 'Todos já têm serviço nesse dia e horário. Escolha outro horário.' })
      : html`${campoSelecao({
        nome: 'tecnicoUid', rotulo: temServicos ? 'Técnico do agendamento (sugerido para novos serviços)' : 'Técnico do agendamento',
        opcoes: livres.map((t) => ({ valor: t.uid, rotulo: t.nome })), valor: estado.tecnicoUid, vazio: estado.tecnicoUid ? '' : 'Escolha o técnico',
        ajuda: `A lista mostra só os técnicos livres em ${formatarDataBR(inicio)} às ${formatarHora(inicio)}. Se mudar o dia ou a hora, a lista se atualiza.`,
      })}`);
  }

  function desenharPendencias() {
    const area = raiz.querySelector('#area-pendencias');
    if (!area) return;
    const fechadas = linhasExistentes.filter((l) => l.status !== STATUS.AGENDADO).length;
    const problemas = pendenciasDoAgendamento(estado, contexto());
    mostrar(area, html`
      ${linhasPreservadas.length > 0 && aviso({ texto: `${linhasPreservadas.length} ${linhasPreservadas.length === 1 ? 'serviço usa um aparelho ou tipo que foi excluído' : 'serviços usam aparelho ou tipo que foi excluído'}. ${linhasPreservadas.length === 1 ? 'Ele continua' : 'Eles continuam'} no agendamento e só muda${linhasPreservadas.length === 1 ? '' : 'm'} de dia/hora.` })}
      ${fechadas > 0 && aviso({ texto: `${fechadas} ${fechadas === 1 ? 'serviço deste agendamento já foi concluído ou cancelado' : 'serviços deste agendamento já foram concluídos ou cancelados'} e não aparece${fechadas === 1 ? '' : 'm'} aqui.` })}
      ${problemas.map((p) => aviso({ tom: 'amarelo', texto: p }))}`);
  }

  function redesenharTudo() {
    desenharAparelhos();
    desenharTecnico();
    desenharPendencias();
  }

  // ---------------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------------
  function acharGrupo(chave) { return estado.grupos.find((g) => g.chave === chave); }
  function acharServico(chave) { return todosOsServicos(estado).find((s) => s.chave === chave); }

  function ligarEventosDoFormulario(form) {
    // Textos digitados: só guardam (não redesenham, para não perder o cursor).
    ouvir(form, 'input', (e) => {
      const nome = e.target.name || '';
      if (nome === 'observacao') estado.observacao = e.target.value;
      else if (nome.startsWith('obsAparelho-')) { const g = acharGrupo(nome.slice(12)); if (g) g.obs = e.target.value; }
      else if (nome.startsWith('obsServico-')) { const s = acharServico(nome.slice(11)); if (s) s.obs = e.target.value; }
    });

    ouvir(form, 'change', async (e) => {
      const nome = e.target.name || '';
      if (nome === 'data' || nome === 'hora') {
        estado[nome] = e.target.value;
        try { await carregarOcupacao(); } catch (erro) { toast(traduzirErro(erro), 'erro'); }
        sugerirTecnicoDoAgendamento();
        if (ctx.ativo()) redesenharTudo();
      } else if (nome === 'tecnicoUid') {
        estado.tecnicoUid = e.target.value;
        desenharPendencias();
      } else if (nome.startsWith('tec-')) {
        const s = acharServico(nome.slice(4));
        if (s) {
          s.tecnicoUid = e.target.value;
          if (servicoComErro === s.chave) servicoComErro = null;
          redesenharTudo();
        }
      } else if (nome === 'enderecoId') {
        estado.enderecoId = e.target.value;
      }
    });

    desligar = aoClicar(raiz, {
      'escolher-cliente': (el) => escolherCliente(el.dataset.id),
      'trocar-cliente': trocarCliente,
      'editar-cliente': () => sairPara(`/cliente/${encodeURIComponent(estado.cliente.id)}/editar?voltar=1`),
      'novo-aparelho': () => sairPara(`/cliente/${encodeURIComponent(estado.cliente.id)}/aparelho/novo?voltar=1`),
      'editar-aparelho': (el) => {
        const g = acharGrupo(el.dataset.grupo);
        if (g?.aparelhoId) sairPara(`/aparelho/${encodeURIComponent(g.aparelhoId)}/editar?voltar=1`);
      },
      'adicionar-aparelho': adicionarAparelhoDoCliente,
      'remover-aparelho': (el) => {
        estado.grupos = estado.grupos.filter((g) => g.chave !== el.dataset.grupo);
        redesenharTudo();
      },
      'alternar-obs': (el) => alternarObservacao(el.dataset.tipo, el.dataset.chave),
      'adicionar-servico': (el) => adicionarServico(el.dataset.grupo),
      'editar-servico': (el) => editarServico(el.dataset.servico),
      'remover-servico': (el) => {
        for (const g of estado.grupos) g.servicos = g.servicos.filter((s) => s.chave !== el.dataset.servico);
        redesenharTudo();
      },
    });
  }

  /** Vai para outra tela (editar cliente/aparelho, novo aparelho) guardando o que já foi preenchido. */
  function sairPara(caminho) {
    guardarRascunho(estado, {
      editandoId: params.id || null,
      origemRetornoId,
      aparelhosConhecidos: aparelhos.map((a) => a.id),
    });
    ctx.ir(caminho);
  }

  async function escolherCliente(id) {
    const cliente = todosClientes.find((c) => c.id === id);
    if (!cliente) return;
    estado.cliente = cliente;
    estado.grupos = [];
    estado.enderecoId = '';
    try {
      await carregarAparelhos();
    } catch (erro) {
      toast(traduzirErro(erro), 'erro');
    }
    if (!ctx.ativo()) return;
    desenharCliente();
    redesenharTudo();
  }

  function trocarCliente() {
    estado.cliente = null;
    estado.grupos = [];
    estado.enderecoId = '';
    aparelhos = [];
    desenharCliente();
    redesenharTudo();
  }

  /** Aparelhos do endereço escolhido (aparelho sem endereço aparece em todos). */
  function aparelhosDoEndereco() {
    const varios = (estado.cliente?.enderecos?.length ?? 0) > 1;
    return aparelhos.filter((a) => !varios || !a.enderecoId || a.enderecoId === estado.enderecoId);
  }

  async function adicionarAparelhoDoCliente() {
    const livres = aparelhosDoEndereco().filter((a) => !estado.grupos.some((g) => g.aparelhoId === a.id));
    if (livres.length === 0) {
      toast(aparelhos.length === 0 ? 'Este cliente ainda não tem aparelho. Use "+ Novo aparelho".' : 'Todos os aparelhos deste cliente já estão no agendamento.', 'info');
      return;
    }
    const id = await escolher({
      titulo: 'Qual aparelho?',
      opcoes: livres.map((a) => ({ id: a.id, rotulo: resumoDoAparelho(a) })),
    });
    if (!id) return;
    estado.grupos.push(novoGrupo(id));
    redesenharTudo();
  }

  async function adicionarServico(chaveGrupo) {
    const g = acharGrupo(chaveGrupo);
    if (!g || !g.aparelhoId) return;
    const tipos = tiposAtivos();
    if (tipos.length === 0) {
      toast('Cadastre um tipo de serviço em "Tipos de serviço" primeiro.', 'erro');
      return;
    }
    const tipoId = await escolher({
      titulo: 'Qual serviço?',
      opcoes: tipos.map((t) => ({ id: t.id, rotulo: `${t.nome} · ${textoDoRetorno(t)}` })),
    });
    if (!tipoId) return;
    const s = novoServico({ tipoId });
    g.servicos.push(s);
    s.tecnicoUid = tecnicoSugerido({ ...contexto(), servico: s });
    redesenharTudo();
  }

  /** Edita o serviço: troca o tipo e/ou a duração só deste serviço (técnico e observações continuam). */
  async function editarServico(chaveServico) {
    const s = acharServico(chaveServico);
    if (!s) return;
    const tipos = [...tiposAtivos()];
    const atual = sessao.tipos.find((t) => t.id === s.tipoId);
    if (atual && !tipos.some((t) => t.id === atual.id)) tipos.push(atual);
    const tipoId = await escolher({
      titulo: 'Qual serviço?',
      mensagem: 'Toque no serviço. Técnico e observações continuam.',
      opcoes: tipos.map((t) => ({ id: t.id, rotulo: `${t.id === s.tipoId ? '✓ ' : ''}${t.nome} · ${textoDoRetorno(t)}` })),
    });
    if (!tipoId) return;
    const trocouTipo = tipoId !== s.tipoId;
    const novoTipo = sessao.tipos.find((t) => t.id === tipoId);
    const padrao = duracaoDoTipo(novoTipo);
    const atualDuracao = trocouTipo ? padrao : duracaoDoServicoNaTela(s, tiposPorId());
    const escolha = await escolher({
      titulo: 'Quanto tempo vai levar?',
      mensagem: `O padrão de ${novoTipo?.nome || 'este serviço'} é ${textoDaDuracao(padrao)}. O técnico precisa estar livre por todo esse tempo.`,
      opcoes: [
        { id: 'padrao', rotulo: `${atualDuracao === padrao ? '✓ ' : ''}Padrão do serviço · ${textoDaDuracao(padrao)}` },
        ...DURACOES_OFERECIDAS.filter((m) => m !== padrao).map((m) => ({ id: String(m), rotulo: `${atualDuracao === m ? '✓ ' : ''}${textoDaDuracao(m)}` })),
      ],
      cancelar: trocouTipo ? 'Manter o padrão' : 'Cancelar',
    });
    s.tipoId = tipoId;
    if (escolha === 'padrao' || (escolha === null && trocouTipo)) s.duracaoMin = null;
    else if (escolha !== null) s.duracaoMin = Number(escolha) === padrao ? null : Number(escolha);
    else if (!trocouTipo) return; // cancelou sem mudar nada
    const perdidos = limparTecnicosOcupados(contexto());
    if (perdidos > 0) toast('O técnico não está livre pelo tempo desse serviço. Escolha outro.', 'erro');
    redesenharTudo();
  }

  /** Mostra o problema, leva a tela até o item e coloca o cursor nele. */
  function mostrarProblema(form, problema) {
    const { alvo, texto } = problema;
    if (alvo.campo) {
      mostrarErrosNosCampos(form, { [alvo.campo]: texto });
      return;
    }
    if (alvo.servico) {
      servicoComErro = alvo.servico;
      desenharAparelhos();
      toast(texto, 'erro');
      const cartao = raiz.querySelector(`[data-servico="${alvo.servico}"]`);
      levarAte(cartao?.querySelector('select') || cartao, { focar: Boolean(cartao?.querySelector('select')) });
      return;
    }
    if (alvo.grupo) {
      toast(texto, 'erro');
      levarAte(raiz.querySelector(`[data-grupo="${alvo.grupo}"]`), { focar: false });
    }
  }

  // ---------------------------------------------------------------------------
  // Salvar
  // ---------------------------------------------------------------------------
  async function enviar(form) {
    limparErrosGerais(form);
    const dados = lerCampos(form);
    estado.data = dados.data || estado.data;
    estado.hora = dados.hora || estado.hora;
    estado.observacao = dados.observacao ?? estado.observacao;
    const { valido, erros, dados: limpos } = validarAgendamento({
      clienteId: estado.cliente?.id || '',
      tipoServicoId: '',
      data: estado.data,
      hora: estado.hora,
      enderecoId: estado.enderecoId,
      descricao: estado.observacao,
    }, { hojeISO: hojeISO(), exigirFuturo: !editando, exigirTipo: false });
    if (!valido) {
      const { descricao, ...outros } = erros;
      mostrarErrosNosCampos(form, descricao ? { ...outros, observacao: descricao } : outros);
      return;
    }
    const problemas = problemasDoAgendamento(estado, contexto());
    if (problemas.length > 0) {
      mostrarProblema(form, problemas[0]);
      return;
    }
    const linhas = montarLinhas(estado, { tiposPorId: tiposPorId(), aparelhosPorId: aparelhosPorId(), tecnicosPorUid: tecnicosPorUid() });
    const botaoSalvar = form.querySelector('#botao-salvar');
    await comCarregando(botaoSalvar, async () => {
      const id = await salvarAgendamento({
        empresaId: usuario.empresaId,
        agendamentoId,
        existentes: linhasExistentes,
        cliente: estado.cliente,
        endereco: enderecoDoCliente(estado.cliente, limpos.enderecoId),
        tecnico: tecnicosPorUid()[estado.tecnicoUid] || null,
        data: limpos.data,
        hora: limpos.hora,
        observacao: limpos.descricao,
        linhas,
        origemRetornoId,
        preservar: linhasPreservadas,
      });
      descartarRascunho();
      // A linha aberta na URL pode ter sido removida da edição: vai para uma linha que existe.
      const restantes = await listarLinhasDoAgendamento(usuario.empresaId, { agendamentoId: id });
      const destino = restantes.find((l) => l.status === STATUS.AGENDADO) || restantes[0];
      if (editando) toast('Agendamento atualizado.', 'sucesso');
      else toast(`Agendado para ${formatarDataHoraBR(new Date(`${limpos.data}T${limpos.hora}:00`))}.`, 'sucesso');
      ctx.ir(`/servico/${encodeURIComponent(destino?.id || params.id || id)}`, { substituir: true });
    });
    // Se falhou (ex.: técnico ocupado), atualiza a lista de livres e mostra o motivo já exibido pelo comCarregando.
    if (ctx.ativo() && raiz.contains(form)) {
      try { await carregarOcupacao({ avisar: false }); redesenharTudo(); } catch { /* segue com a lista antiga */ }
    }
  }

  await carregar();
  return limparLigacoes;
}
