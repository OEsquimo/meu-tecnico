// =============================================================================
// TELA: Agenda
// =============================================================================
// Calendário do mês (pontinho nos dias com serviço) + lista dos serviços do dia
// escolhido.
//   * ADMINISTRADOR: vê os serviços de todos, com filtro por técnico, e tem o
//     botão "Agendar" (já abre a tela de agendar com o dia escolhido).
//   * TÉCNICO: vê só os serviços dele (a consulta já filtra no servidor).
// Mostra só serviços AGENDADOS (os concluídos ficam no Histórico).
// Padrão: esqueleto ao carregar; se falhar, "Tentar de novo".
// =============================================================================

import { html, mostrar, aoClicar, aoEnviar } from '../nucleo/ui.js';
import { cabecalho, botao, estadoVazio, esqueletos, campoSelecao } from '../nucleo/componentes.js';
import { icone } from '../nucleo/icones.js';
import { listarAgendados } from '../servicos/servicos.js';
import { tecnicosParaAtribuir } from '../servicos/equipe.js';
import { gradeDoMes, agruparPorDia, mesVizinho, DIAS_DA_SEMANA } from '../dominio/agenda.js';
import { formatarMesAno, formatarDiaExtenso, hojeISO } from '../dominio/datas.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar, cartaoDoServico, abrirNavegacao, tituloSecao } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz } = ctx;
  const usuario = contextoDoUsuario();
  const hoje = hojeISO();

  // Estado da tela: mês mostrado, dia escolhido e (admin) técnico do filtro.
  const [anoHoje, mesHoje] = hoje.split('-').map(Number);
  let ano = anoHoje;
  let mes = mesHoje - 1;
  let diaEscolhido = hoje;
  let filtroTecnico = ''; // '' = todos
  let servicosDoMes = []; // todos os agendados do mês (sem filtro de técnico)
  let tecnicos = []; // opções do filtro (só admin)

  const topo = () => cabecalho({
    titulo: 'Agenda',
    acaoDireita: usuario.admin ? botao({ texto: 'Agendar', iconeNome: 'mais', href: `#/agendar?data=${diaEscolhido}`, pequeno: true, id: 'botao-agendar' }) : null,
  });

  // ---------------------------------------------------------------------------
  // Carregar o mês
  // ---------------------------------------------------------------------------
  async function carregarMes() {
    mostrar(raiz, html`${topo()}${esqueletos(3)}`);
    try {
      await carregarEstilos();
      const tarefas = [listarAgendados({
        empresaId: usuario.empresaId,
        de: new Date(ano, mes, 1),
        ate: new Date(ano, mes + 1, 1),
        tecnicoUid: usuario.admin ? null : usuario.uid,
      })];
      // A lista de técnicos só é buscada uma vez; se falhar, o filtro simplesmente some.
      if (usuario.admin && tecnicos.length === 0) {
        tarefas.push(tecnicosParaAtribuir(usuario.empresaId, { uid: usuario.uid, nome: usuario.nome }).catch(() => []));
      }
      const [lista, equipe] = await Promise.all(tarefas);
      if (!ctx.ativo()) return;
      servicosDoMes = lista;
      if (equipe) tecnicos = equipe;
      desenhar();
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregarMes, topo());
    }
  }

  /** Serviços do mês já com o filtro de técnico aplicado. */
  const visiveis = () => (filtroTecnico ? servicosDoMes.filter((s) => s.tecnicoUid === filtroTecnico) : servicosDoMes);

  // ---------------------------------------------------------------------------
  // Desenhar
  // ---------------------------------------------------------------------------
  function desenhar() {
    const grupos = agruparPorDia(visiveis());
    const doDia = grupos[diaEscolhido] || [];

    mostrar(raiz, html`
      ${topo()}
      <div class="pilha">
        ${usuario.admin && tecnicos.length > 1 && html`
          <form id="form-filtro" novalidate>
            ${campoSelecao({
    nome: 'filtro', rotulo: 'Técnico', valor: filtroTecnico, vazio: 'Todos os técnicos',
    opcoes: tecnicos.map((t) => ({ valor: t.uid, rotulo: t.nome })),
  })}
          </form>`}

        <section class="cartao pilha pilha--pequena" aria-label="Calendário">
          <div class="agenda-mes">
            <button type="button" class="agenda-mes__botao" data-acao="mes-anterior" aria-label="Mês anterior">${icone('voltar', 22)}</button>
            <div class="agenda-mes__titulo" aria-live="polite">${formatarMesAno(ano, mes)}</div>
            <button type="button" class="agenda-mes__botao agenda-mes__botao--proximo" data-acao="mes-seguinte" aria-label="Próximo mês">${icone('voltar', 22)}</button>
          </div>
          <div class="calendario">
            ${DIAS_DA_SEMANA.map((d) => html`<div class="calendario__semana" aria-hidden="true">${d}</div>`)}
            ${gradeDoMes(ano, mes).map((c) => celula(c, grupos))}
          </div>
        </section>

        <section class="pilha pilha--pequena" aria-label="Serviços do dia">
          ${tituloSecao(formatarDiaExtenso(diaEscolhido))}
          ${doDia.length === 0
    ? html`<div class="cartao">${estadoVazio({
      icone: 'agenda',
      titulo: 'Nenhum serviço neste dia',
      texto: usuario.admin ? 'Toque em "Agendar" para marcar um serviço.' : 'Você não tem serviços neste dia.',
      acao: usuario.admin ? botao({ texto: 'Agendar serviço', iconeNome: 'mais', href: `#/agendar?data=${diaEscolhido}` }) : null,
    })}</div>`
    : doDia.map((s) => cartaoDoServico(s, { mostrarTecnico: usuario.admin, acoes: true }))}
        </section>
      </div>`);

    const filtro = raiz.querySelector('#form-filtro');
    if (filtro) aoEnviar(filtro, () => {});
  }

  /** Uma célula do calendário: dia vazio, ou botão com pontinho se tem serviço. */
  function celula(c, grupos) {
    if (!c.iso) return html`<span class="calendario__dia calendario__dia--vazio" aria-hidden="true"></span>`;
    const tem = !!grupos[c.iso];
    const classes = ['calendario__dia'];
    if (c.iso === hoje) classes.push('calendario__dia--hoje');
    if (c.iso === diaEscolhido) classes.push('calendario__dia--selecionado');
    return html`<button type="button" class="${classes.join(' ')}" data-acao="dia" data-dia="${c.iso}"
      aria-label="${formatarDiaExtenso(c.iso)}${tem ? `, ${grupos[c.iso].length} serviço(s)` : ''}" aria-pressed="${c.iso === diaEscolhido ? 'true' : 'false'}">
      ${c.dia}${tem && html`<span class="calendario__ponto"></span>`}</button>`;
  }

  /** Muda de mês: escolhe hoje (se for o mês atual) ou o dia 1, e busca os dados. */
  function irParaMes(passo) {
    const novo = mesVizinho(ano, mes, passo);
    ano = novo.ano;
    mes = novo.mes;
    const p = (n) => String(n).padStart(2, '0');
    diaEscolhido = (ano === anoHoje && mes === mesHoje - 1) ? hoje : `${ano}-${p(mes + 1)}-01`;
    carregarMes();
  }

  const desligar = aoClicar(raiz, {
    dia: (el) => {
      diaEscolhido = el.dataset.dia;
      desenhar();
    },
    'mes-anterior': () => irParaMes(-1),
    'mes-seguinte': () => irParaMes(1),
    navegar: (el) => {
      const servico = servicosDoMes.find((s) => s.id === el.dataset.id);
      if (servico) abrirNavegacao(servico);
    },
  });

  // O filtro de técnico (select) muda sem enviar formulário.
  const aoMudar = (evento) => {
    if (evento.target?.name !== 'filtro') return;
    filtroTecnico = evento.target.value;
    desenhar();
    raiz.querySelector('select[name="filtro"]')?.focus();
  };
  raiz.addEventListener('change', aoMudar);

  await carregarMes();
  return () => {
    desligar();
    raiz.removeEventListener('change', aoMudar);
  };
}
