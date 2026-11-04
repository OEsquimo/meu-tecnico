// =============================================================================
// TELA: Serviços concluídos (/historico)
// =============================================================================
// Mostra os 30 mais recentes e, no fim da lista, o botão "Carregar mais" (mais 30
// a cada toque). Dá para buscar por CLIENTE e filtrar por serviço, técnico e
// período. Serviços concluídos NÃO podem ser excluídos: o histórico fica
// guardado como registro e garantia, e o valor não muda se os preços mudarem.
// O técnico vê só os dele e nunca vê valores.
//
// Como busca: sem filtro, lê só uma página por vez. Com busca/filtro, lê até
// LIMITE_BUSCA_HISTORICO dos mais recentes (do período escolhido) e filtra na tela,
// mostrando 30 por vez. O período filtra no banco, então ele refina de verdade.
// =============================================================================

import { html, mostrar, esperarDigitar, comCarregando, mostrarErro } from '../nucleo/ui.js';
import { cabecalho, botao, itemLista, estadoVazio, esqueletos, selo, campoSelecao } from '../nucleo/componentes.js';
import { textoParaBusca, bruto } from '../nucleo/ui-texto.js';
import { sessao } from '../nucleo/sessao.js';
import { listarHistorico } from '../servicos/servicos.js';
import { tecnicosParaAtribuir } from '../servicos/equipe.js';
import { formatarDataBR, combinarDataHora } from '../dominio/datas.js';
import { PAGINA_HISTORICO, LIMITE_BUSCA_HISTORICO } from '../nucleo/constantes.js';
import { textoDosTecnicos, servicoTemTecnico } from '../dominio/servicos.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar } from './servicos-comum.js';

/** AAAA-MM-DD do dia seguinte (para o "até" ser inclusivo). */
function diaSeguinte(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const x = new Date(a, m - 1, d + 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

export default async function montar(ctx) {
  const { raiz } = ctx;
  const usuario = contextoDoUsuario();
  const topo = cabecalho({ titulo: 'Serviços concluídos', subtitulo: 'Histórico guardado como registro e garantia' });

  // Filtros (o que o usuário escolheu) e dados lidos.
  const filtro = { texto: '', servico: '', tecnico: '', de: '', ate: '' };
  let tecnicos = [];
  let dados = []; // o que veio do banco
  let lido = { modo: 'pagina', de: '', ate: '', limite: PAGINA_HISTORICO }; // como `dados` foi lido
  let mostrando = PAGINA_HISTORICO; // quantos aparecem (no modo busca)
  let aberto = false; // "Filtros" aberto?

  const filtrando = () => Boolean(filtro.texto.trim() || filtro.servico || filtro.tecnico);
  const nomesDeServico = () => [...new Set((sessao.tipos || []).map((t) => t.nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  async function ler(modo, limite) {
    const de = filtro.de ? combinarDataHora(filtro.de, '00:00') : null;
    const ate = filtro.ate ? combinarDataHora(diaSeguinte(filtro.ate), '00:00') : null;
    dados = await listarHistorico({
      empresaId: usuario.empresaId, tecnicoUid: usuario.admin ? null : usuario.uid, de, ate,
      limite: modo === 'busca' ? LIMITE_BUSCA_HISTORICO : limite,
    });
    lido = { modo, de: filtro.de, ate: filtro.ate, limite };
  }

  async function carregar() {
    mostrar(raiz, html`${topo}${esqueletos(4)}`);
    try {
      await carregarEstilos();
      const [, equipe] = await Promise.all([
        ler('pagina', PAGINA_HISTORICO),
        usuario.admin ? tecnicosParaAtribuir(usuario.empresaId, { uid: usuario.uid, nome: usuario.nome }).catch(() => []) : [],
      ]);
      tecnicos = equipe;
      if (!ctx.ativo()) return;
      desenhar();
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, topo);
    }
  }

  /** Lista final: filtra na tela o que foi lido. */
  function filtrados() {
    const t = textoParaBusca(filtro.texto);
    return dados.filter((s) => (!t || textoParaBusca(`${s.clienteNome} ${s.aparelhoResumo || ''}`).includes(t))
      && (!filtro.servico || s.tipoServicoNome === filtro.servico)
      && (!filtro.tecnico || servicoTemTecnico(s, filtro.tecnico)));
  }

  function desenhar() {
    mostrar(raiz, html`
      ${topo}
      <div class="pilha">
        <div class="campo"><input class="campo__entrada" id="busca" type="search" placeholder="Buscar cliente" aria-label="Buscar cliente" value="${filtro.texto}" /></div>
        <details id="filtros" ${aberto ? bruto('open') : ''}>
          <summary class="texto-pequeno">Filtrar por serviço, técnico ou período</summary>
          <div class="pilha pilha--pequena">
            ${campoSelecao({ nome: 'servico', rotulo: 'Serviço', valor: filtro.servico, vazio: 'Todos os serviços', opcoes: nomesDeServico().map((n) => ({ valor: n, rotulo: n })) })}
            ${usuario.admin && tecnicos.length > 0 && campoSelecao({ nome: 'tecnico', rotulo: 'Técnico', valor: filtro.tecnico, vazio: 'Todos os técnicos', opcoes: tecnicos.map((t) => ({ valor: t.uid, rotulo: t.nome })) })}
            <div class="campo"><label class="campo__rotulo" for="campo-de">Concluídos a partir de</label><input class="campo__entrada" id="campo-de" name="de" type="date" value="${filtro.de}" /></div>
            <div class="campo"><label class="campo__rotulo" for="campo-ate">Concluídos até</label><input class="campo__entrada" id="campo-ate" name="ate" type="date" value="${filtro.ate}" /></div>
          </div>
        </details>
        <div id="resultado" class="lista pilha pilha--pequena"></div>
        <div id="rodape" class="pilha pilha--pequena"></div>
      </div>`);
    raiz.querySelector('#filtros')?.addEventListener('toggle', (e) => { aberto = e.target.open; });
    desenharLista();
  }

  function desenharLista() {
    const todos = filtrados();
    const modoBusca = lido.modo === 'busca';
    const aparecem = modoBusca ? todos.slice(0, mostrando) : todos;
    const alvo = raiz.querySelector('#resultado');
    const rodape = raiz.querySelector('#rodape');
    const comFiltro = filtrando() || Boolean(filtro.de || filtro.ate);
    mostrar(alvo, todos.length === 0
      ? estadoVazio({
        icone: 'relogio',
        titulo: dados.length || comFiltro ? 'Nada encontrado' : 'Nenhum serviço concluído ainda',
        texto: dados.length || comFiltro ? 'Tente outro nome, serviço ou período.' : 'Quando você concluir serviços, eles aparecem aqui.',
      })
      : html`${aparecem.map((s) => itemLista({
        href: `#/servico/${s.id}`,
        titulo: s.clienteNome,
        sub: `${s.tipoServicoNome} · ${formatarDataBR(s.dataConclusao)}${textoDosTecnicos(s) ? ` · ${textoDosTecnicos(s)}` : ''}`,
        direita: usuario.admin && s.valorDefinido === false ? selo('Sem valor', 'amarelo') : (s.pago ? selo('Pago', 'verde') : selo('A receber', 'amarelo')),
      }))}`);

    // Mais registros: no modo página, pode haver mais no banco; no modo busca, mais além dos que aparecem.
    const temMais = modoBusca ? todos.length > aparecem.length : dados.length >= lido.limite;
    mostrar(rodape, html`
      ${temMais ? botao({ texto: 'Carregar mais', variante: 'secundario', acao: 'carregar-mais', bloco: true }) : ''}
      ${modoBusca && !temMais && dados.length >= LIMITE_BUSCA_HISTORICO ? html`<p class="texto-suave texto-pequeno">A busca olhou os ${LIMITE_BUSCA_HISTORICO} concluídos mais recentes. Para ir mais longe, escolha um período.</p>` : ''}`);
    const botaoMais = rodape.querySelector('[data-acao="carregar-mais"]');
    if (botaoMais) botaoMais.addEventListener('click', () => carregarMais(botaoMais));
  }

  async function carregarMais(el) {
    await comCarregando(el, async () => {
      try {
        if (lido.modo === 'busca') {
          mostrando += PAGINA_HISTORICO;
        } else {
          await ler('pagina', lido.limite + PAGINA_HISTORICO);
        }
        desenharLista();
      } catch (e) { mostrarErro(e); }
    });
  }

  /** Mudou algo: se já leu o que precisa, só refiltra; senão lê de novo. */
  async function aoMudarFiltro() {
    const modo = filtrando() ? 'busca' : 'pagina';
    const periodoMudou = lido.de !== filtro.de || lido.ate !== filtro.ate;
    mostrando = PAGINA_HISTORICO;
    if (periodoMudou || modo !== lido.modo) {
      try {
        await ler(modo, PAGINA_HISTORICO);
      } catch (e) { mostrarErro(e); return; }
    }
    if (ctx.ativo()) desenharLista();
  }

  const digitou = esperarDigitar((e) => { filtro.texto = e.target.value; aoMudarFiltro(); });
  const aoDigitar = (e) => { if (e.target.id === 'busca') digitou(e); };
  const aoAlterar = (e) => {
    const nome = e.target?.name;
    if (!['servico', 'tecnico', 'de', 'ate'].includes(nome)) return;
    filtro[nome] = e.target.value;
    aoMudarFiltro();
  };
  raiz.addEventListener('input', aoDigitar);
  raiz.addEventListener('change', aoAlterar);

  await carregar();
  return () => {
    raiz.removeEventListener('input', aoDigitar);
    raiz.removeEventListener('change', aoAlterar);
  };
}
