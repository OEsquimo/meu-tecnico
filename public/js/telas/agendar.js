// =============================================================================
// TELA: Agendar serviço / Editar agendamento (só administrador)
// =============================================================================
// Rotas: /agendar  e  /servico/:id/editar
// Parâmetros opcionais na consulta (usados por Retornos, Cliente e Agenda):
//   ?cliente=ID  ?aparelho=ID  ?tipo=ID  ?data=AAAA-MM-DD
//   ?retorno=ID  -> ID do serviço de ORIGEM do lembrete de retorno; ao agendar,
//                   o lembrete passa a "agendado" (origemRetornoId).
// Fluxo: cliente (busca) -> endereço (só se tiver 2) -> aparelho ou "sem
// aparelho" -> tipo -> técnico (só se houver equipe) -> data, hora, descrição.
// =============================================================================

import { html, mostrar, aoClicar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, esperarDigitar, toast } from '../nucleo/ui.js';
import { cabecalho, botao, aviso, avatar, estadoVazio, esqueletos, campoTexto, campoTextoLongo, campoSelecao, campoPilulas } from '../nucleo/componentes.js';
import { sessao, tiposAtivos } from '../nucleo/sessao.js';
import { traduzirErro } from '../nucleo/erros.js';
import { listarClientes, buscarCliente } from '../servicos/clientes.js';
import { listarAparelhosDoCliente } from '../servicos/aparelhos.js';
import { tecnicosParaAtribuir } from '../servicos/equipe.js';
import { buscarServico, agendarServico, atualizarAgendamento } from '../servicos/servicos.js';
import { filtrarClientes, enderecoDoCliente } from '../dominio/clientes.js';
import { validarAgendamento } from '../dominio/validacoes.js';
import { resumoDoAparelho } from '../dominio/aparelhos.js';
import { linhaCurtaDoEndereco } from '../dominio/endereco.js';
import { formatarTelefone } from '../dominio/telefone.js';
import { ehISOValido, formatarDataHoraBR, hojeISO, paraISO, formatarHora } from '../dominio/datas.js';
import { STATUS } from '../dominio/servicos.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar, mostrarNaoEncontrado } from './servicos-comum.js';

const MAXIMO_RESULTADOS = 8;

export default async function montar(ctx) {
  const { raiz, params, consulta } = ctx;
  const usuario = contextoDoUsuario();
  const editando = Boolean(params.id);
  const titulo = editando ? 'Editar agendamento' : 'Agendar serviço';
  const topo = cabecalho({ titulo, voltarPara: true });
  let desligar = () => {};
  let ouvintes = [];

  // Estado do formulário (os campos de texto são lidos do formulário ao enviar).
  const estado = {
    cliente: null, // objeto do cliente escolhido
    enderecoId: '',
    aparelhoId: '', // '' = sem aparelho
    aparelhos: [], // aparelhos do cliente escolhido
    tipoId: '',
    tecnicoUid: '',
    data: hojeISO(),
    hora: '09:00',
    descricao: '',
  };
  let servico = null; // serviço que está sendo editado
  let origemRetornoId = null;
  let todosClientes = [];
  let tecnicos = [];

  async function carregar() {
    mostrar(raiz, html`${topo}${esqueletos(3)}`);
    try {
      await carregarEstilos();
      [todosClientes, tecnicos] = await Promise.all([
        listarClientes(usuario.empresaId),
        tecnicosParaAtribuir(usuario.empresaId, { uid: usuario.uid, nome: usuario.nome }),
      ]);
      estado.tecnicoUid = usuario.uid;

      if (editando) {
        servico = await buscarServico(usuario.empresaId, params.id);
        if (!servico) return mostrarNaoEncontrado(raiz, 'Serviço não encontrado', 'Ele pode ter sido excluído.', '#/agenda');
        if (servico.status !== STATUS.AGENDADO) {
          return mostrarNaoEncontrado(raiz, 'Não dá para editar', 'Só serviços que ainda estão agendados podem ser editados.', `#/servico/${encodeURIComponent(servico.id)}`);
        }
        estado.cliente = todosClientes.find((c) => c.id === servico.clienteId) || await buscarCliente(usuario.empresaId, servico.clienteId);
        estado.enderecoId = servico.enderecoId || '';
        estado.aparelhoId = servico.aparelhoId || '';
        estado.tipoId = servico.tipoServicoId || '';
        estado.tecnicoUid = servico.tecnicoUid || usuario.uid;
        estado.data = paraISO(servico.dataAgendada);
        estado.hora = formatarHora(servico.dataAgendada);
        estado.descricao = servico.descricao || '';
        // Técnico que saiu da equipe continua aparecendo na lista deste serviço.
        if (servico.tecnicoUid && !tecnicos.some((t) => t.uid === servico.tecnicoUid)) {
          tecnicos.push({ uid: servico.tecnicoUid, nome: servico.tecnicoNome || 'Técnico' });
        }
      } else {
        await preencherPelaConsulta();
      }
      if (estado.cliente) await carregarAparelhos();
      if (!ctx.ativo()) return;
      desenhar();
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, topo);
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
      estado.aparelhoId = consulta.get('aparelho') || origem?.aparelhoId || '';
      estado.enderecoId = origem?.enderecoId || '';
    }
    const tipoId = consulta.get('tipo') || origem?.tipoServicoId || '';
    if (tipoId && sessao.tipos.some((t) => t.id === tipoId)) estado.tipoId = tipoId;
    const data = consulta.get('data');
    if (data && ehISOValido(data)) estado.data = data;
  }

  /** Busca os aparelhos do cliente escolhido; sem aparelho válido, volta para "sem aparelho". */
  async function carregarAparelhos() {
    estado.aparelhos = estado.cliente ? await listarAparelhosDoCliente(usuario.empresaId, estado.cliente.id).catch(() => []) : [];
    if (estado.aparelhoId && !estado.aparelhos.some((a) => a.id === estado.aparelhoId)) estado.aparelhoId = '';
    // Endereço: o do aparelho escolhido, o já informado ou o primeiro do cliente.
    const aparelho = estado.aparelhos.find((a) => a.id === estado.aparelhoId);
    const enderecos = estado.cliente?.enderecos || [];
    if (aparelho?.enderecoId && enderecos.some((e) => e.id === aparelho.enderecoId)) estado.enderecoId = aparelho.enderecoId;
    if (!enderecos.some((e) => e.id === estado.enderecoId)) estado.enderecoId = enderecos[0]?.id || '';
  }

  // ---------------------------------------------------------------------------
  // Desenho
  // ---------------------------------------------------------------------------
  function limparLigacoes() {
    desligar();
    for (const [alvo, tipo, f] of ouvintes) alvo.removeEventListener(tipo, f);
    ouvintes = [];
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
    const tipos = tiposParaEscolher();
    mostrar(raiz, html`
      ${topo}
      <form id="form-agendar" class="formulario" novalidate>
        <div data-erros-gerais></div>
        <div id="area-cliente" class="pilha"></div>
        ${tipos.length === 0
    ? aviso({ tom: 'amarelo', titulo: 'Nenhum tipo de serviço ativo', texto: html`Cadastre ou ative um tipo em <a href="#/tipos-servico">Tipos de serviço</a>.` })
    : campoPilulas({ nome: 'tipoServicoId', rotulo: 'Tipo de serviço', opcoes: tipos.map((t) => ({ valor: t.id, rotulo: t.nome })), valor: estado.tipoId })}
        ${tecnicos.length > 1 && campoSelecao({ nome: 'tecnicoUid', rotulo: 'Técnico', opcoes: tecnicos.map((t) => ({ valor: t.uid, rotulo: t.nome })), valor: estado.tecnicoUid })}
        <div class="grade-2">
          ${campoTexto({ nome: 'data', rotulo: 'Dia', tipo: 'date', valor: estado.data })}
          ${campoTexto({ nome: 'hora', rotulo: 'Hora', tipo: 'time', valor: estado.hora })}
        </div>
        ${campoTextoLongo({ nome: 'descricao', rotulo: 'Observação para o técnico', opcional: true, valor: estado.descricao, maximo: 2000, placeholder: 'Ex.: levar escada, avisar antes de chegar' })}
        ${botao({ texto: editando ? 'Salvar alterações' : 'Agendar', tipo: 'submit', bloco: true, id: 'botao-salvar' })}
      </form>`);
    desenharCliente();

    const form = raiz.querySelector('#form-agendar');
    aoEnviar(form, () => enviar(form));
  }

  /** Tipos que aparecem na escolha: os ativos (+ o do serviço editado, se foi desativado). */
  function tiposParaEscolher() {
    const lista = [...tiposAtivos()];
    const atual = sessao.tipos.find((t) => t.id === estado.tipoId);
    if (atual && !lista.some((t) => t.id === atual.id)) lista.push(atual);
    return lista;
  }

  /** Área do cliente: busca (sem cliente) ou resumo + endereço + aparelho. */
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
      entrada.addEventListener('input', filtrar);
      ouvintes.push([entrada, 'input', filtrar]);
      desligar = aoClicar(area, { 'escolher-cliente': (el) => escolherCliente(el.dataset.id) });
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
          ${!editando && botao({ texto: 'Trocar', variante: 'secundario', pequeno: true, acao: 'trocar-cliente' })}
        </div>
      </div>
      ${enderecos.length > 1 && campoPilulas({
    nome: 'enderecoId', rotulo: 'Endereço',
    opcoes: enderecos.map((e, i) => ({ valor: e.id, rotulo: [e.apelido || `Endereço ${i + 1}`, linhaCurtaDoEndereco(e)].filter(Boolean).join(' · ') })),
    valor: estado.enderecoId,
  })}
      <div id="area-aparelho"></div>`);
    desenharAparelhos();
    desligar = aoClicar(area, {
      'trocar-cliente': () => {
        estado.cliente = null;
        estado.aparelhos = [];
        estado.aparelhoId = '';
        estado.enderecoId = '';
        desenharCliente();
      },
    });
    // Trocar de endereço atualiza a lista de aparelhos (cada aparelho é de um endereço).
    const aoMudarEndereco = (e) => {
      if (e.target?.name !== 'enderecoId') return;
      estado.enderecoId = e.target.value;
      if (!aparelhosDoEndereco().some((a) => a.id === estado.aparelhoId)) estado.aparelhoId = '';
      desenharAparelhos();
    };
    area.addEventListener('change', aoMudarEndereco);
    ouvintes.push([area, 'change', aoMudarEndereco]);
    const aoMudarAparelho = (e) => {
      if (e.target?.name === 'aparelhoId') estado.aparelhoId = e.target.value;
    };
    area.addEventListener('change', aoMudarAparelho);
    ouvintes.push([area, 'change', aoMudarAparelho]);
  }

  /** Aparelhos do endereço escolhido (aparelho sem endereço aparece em todos). */
  function aparelhosDoEndereco() {
    const varios = (estado.cliente?.enderecos?.length ?? 0) > 1;
    return estado.aparelhos.filter((a) => !varios || !a.enderecoId || a.enderecoId === estado.enderecoId);
  }

  function desenharAparelhos() {
    const area = raiz.querySelector('#area-aparelho');
    if (!area) return;
    const lista = aparelhosDoEndereco();
    const opcoes = [...lista.map((a) => ({ valor: a.id, rotulo: resumoDoAparelho(a) })), { valor: '', rotulo: 'Sem aparelho' }];
    mostrar(area, html`
      ${campoPilulas({ nome: 'aparelhoId', rotulo: 'Aparelho', opcoes, valor: estado.aparelhoId })}
      ${lista.length === 0 && html`<p class="campo__ajuda">Este cliente ainda não tem aparelho neste endereço. Você pode agendar sem aparelho ou <a href="#/cliente/${encodeURIComponent(estado.cliente.id)}/aparelho/novo">cadastrar um aparelho</a>.</p>`}`);
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

  async function escolherCliente(id) {
    const cliente = todosClientes.find((c) => c.id === id);
    if (!cliente) return;
    guardarCamposDigitados();
    estado.cliente = cliente;
    estado.aparelhoId = '';
    estado.enderecoId = '';
    try {
      await carregarAparelhos();
    } catch (erro) {
      toast(traduzirErro(erro), 'erro');
    }
    if (ctx.ativo()) desenharCliente();
  }

  /** Guarda o que já foi digitado/escolhido nos campos que ficam fora da área do cliente. */
  function guardarCamposDigitados() {
    const form = raiz.querySelector('#form-agendar');
    if (!form) return;
    const d = lerCampos(form);
    if ('tipoServicoId' in d) estado.tipoId = d.tipoServicoId;
    if ('tecnicoUid' in d && d.tecnicoUid) estado.tecnicoUid = d.tecnicoUid;
    if (d.data) estado.data = d.data;
    if (d.hora) estado.hora = d.hora;
    estado.descricao = d.descricao ?? '';
  }

  // ---------------------------------------------------------------------------
  // Salvar
  // ---------------------------------------------------------------------------
  async function enviar(form) {
    limparErrosGerais(form);
    guardarCamposDigitados();
    const dados = lerCampos(form);
    const { valido, erros, dados: limpos } = validarAgendamento({
      clienteId: estado.cliente?.id || '',
      tipoServicoId: dados.tipoServicoId || '',
      data: dados.data,
      hora: dados.hora,
      enderecoId: dados.enderecoId || estado.enderecoId,
      descricao: dados.descricao,
    }, { hojeISO: hojeISO(), exigirFuturo: !editando });
    if (!valido) {
      mostrarErrosNosCampos(form, erros);
      return;
    }
    const tipo = sessao.tipos.find((t) => t.id === limpos.tipoServicoId);
    if (!tipo) {
      mostrarErrosNosCampos(form, { tipoServicoId: 'Escolha o tipo de serviço.' });
      return;
    }
    const aparelho = estado.aparelhos.find((a) => a.id === (dados.aparelhoId ?? estado.aparelhoId)) || null;
    const uidTecnico = dados.tecnicoUid || estado.tecnicoUid || usuario.uid;
    const nomeDaLista = tecnicos.find((t) => t.uid === uidTecnico)?.nome || '';
    // O administrador aparece na lista como "Nome (eu)"; dentro do serviço guardamos só o nome.
    const tecnico = { uid: uidTecnico, nome: uidTecnico === usuario.uid ? (usuario.nome || 'Administrador') : nomeDaLista };
    const comum = {
      empresaId: usuario.empresaId, cliente: estado.cliente, endereco: enderecoDoCliente(estado.cliente, limpos.enderecoId),
      aparelho, tipo, tecnico, data: limpos.data, hora: limpos.hora, descricao: limpos.descricao,
    };
    const botaoSalvar = form.querySelector('#botao-salvar');
    await comCarregando(botaoSalvar, async () => {
      if (editando) {
        await atualizarAgendamento({ ...comum, servico });
        toast('Agendamento atualizado.', 'sucesso');
        ctx.ir(`/servico/${encodeURIComponent(servico.id)}`, { substituir: true });
      } else {
        const id = await agendarServico({ ...comum, origemRetornoId });
        toast(`Agendado para ${formatarDataHoraBR(new Date(`${limpos.data}T${limpos.hora}:00`))}.`, 'sucesso');
        ctx.ir(`/servico/${encodeURIComponent(id)}`, { substituir: true });
      }
    });
  }

  await carregar();
  return limparLigacoes;
}
