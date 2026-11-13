// =============================================================================
// TELA: Agenda
// =============================================================================
// Calendário do mês (de hoje em diante, um ponto por dia: azul = tem agendamento e ainda cabe mais; vermelho = lotado;
// dias que já passaram: verde = serviço concluído, amarelo = atrasado ou cancelado, e podem ser os dois)
// + lista dos serviços do dia escolhido.
//   * ADMINISTRADOR: vê os serviços de todos, com filtro por técnico, e tem o
//     botão "Agendar" (já abre a tela de agendar com o dia escolhido).
//   * TÉCNICO: vê só os serviços dele (a consulta já filtra no servidor) e só o ponto azul:
//     ele não enxerga a agenda da empresa, então não sabe se o dia está lotado.
//   * Com o filtro de técnico ligado, os pontos falam só daquele técnico (a disponibilidade dele).
// Mostra só serviços AGENDADOS (os concluídos ficam no Histórico).
// Cada VISITA vira um cartão só (cliente e endereço uma vez); os serviços ficam
// dentro, por aparelho, cada um com seu técnico e seu "Concluir".
// Padrão: esqueleto ao carregar; se falhar, "Tentar de novo".
// =============================================================================

import { html, mostrar, aoClicar, aoEnviar, confirmar, comCarregando, toast, mostrarErro } from '../nucleo/ui.js';
import { cabecalho, botao, estadoVazio, esqueletos, campoSelecao } from '../nucleo/componentes.js';
import { icone } from '../nucleo/icones.js';
import { listarAgendados, listarConcluidosECancelados, cancelarAgendamentoCompleto, excluirAgendamentoCompleto } from '../servicos/servicos.js';
import { tecnicosParaAtribuir } from '../servicos/equipe.js';
import { agruparPorDia, mesVizinho } from '../dominio/agenda.js';
import { menorDuracaoDosTipos, pontosDoMes, pontosDoHistorico } from '../dominio/disponibilidade.js';
import { expedienteDaEmpresa, regrasDaEmpresa } from '../dominio/expediente.js';
import { sessao } from '../nucleo/sessao.js';
import { calendarioDoMes } from './calendario-comum.js';
import { formatarMesAno, formatarDiaExtenso, hojeISO, paraISO } from '../dominio/datas.js';
import { agruparAgendamentos, servicoTemTecnico, chaveDoAgendamento } from '../dominio/servicos.js';
import { abrirSeletorDeHorario } from './seletor-horario.js';
import { DURACAO_PADRAO_MIN } from '../nucleo/constantes.js';
import { diaDeVolta, carregarEstilos, contextoDoUsuario, mostrarErroComTentar, cartaoDaVisita, abrirNavegacao, tituloSecao } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz } = ctx;
  const usuario = contextoDoUsuario();
  const hoje = hojeISO();

  // Estado da tela: mês mostrado, dia escolhido e (admin) técnico do filtro.
  const [anoHoje, mesHoje] = hoje.split('-').map(Number);
  let ano = anoHoje;
  let mes = mesHoje - 1;
  let diaEscolhido = hoje;
  if (diaDeVolta.iso && Date.now() - diaDeVolta.quando < 10 * 60000 && diaDeVolta.iso >= hoje) {
    diaEscolhido = diaDeVolta.iso;
    ano = Number(diaEscolhido.slice(0, 4));
    mes = Number(diaEscolhido.slice(5, 7)) - 1;
  }
  diaDeVolta.iso = '';
  let filtroTecnico = ''; // '' = todos
  let servicosDoMes = []; // todos os agendados do mês (sem filtro de técnico)
  let fechadosDoMes = []; // concluídos e cancelados do mês (só para os pontos verde e amarelo dos dias que já passaram)
  let tecnicos = []; // opções do filtro (só admin)

  const topo = () => cabecalho({ titulo: 'Agenda', centralizado: true });

  // ---------------------------------------------------------------------------
  // Carregar o mês
  // ---------------------------------------------------------------------------
  async function carregarMes() {
    mostrar(raiz, html`${topo()}${esqueletos(3)}`);
    try {
      await carregarEstilos();
      const tarefas = [listarAgendados({
        empresaId: usuario.empresaId,
        // Com um dia de margem de cada lado: um serviço que começa no fim de um dia e invade o seguinte
        // também entra na conta do ponto vermelho.
        de: new Date(ano, mes, 0),
        ate: new Date(ano, mes + 1, 2),
        tecnicoUid: usuario.admin ? null : usuario.uid,
      }), listarConcluidosECancelados({
        empresaId: usuario.empresaId, de: new Date(ano, mes, 1), ate: new Date(ano, mes + 1, 1), tecnicoUid: usuario.admin ? null : usuario.uid,
      }).catch(() => [])]; // o histórico não pode derrubar a Agenda: se falhar, só some o verde
      // A lista de técnicos só é buscada uma vez; se falhar, o filtro simplesmente some.
      if (usuario.admin && tecnicos.length === 0) {
        tarefas.push(tecnicosParaAtribuir(usuario.empresaId, { uid: usuario.uid, nome: usuario.nome, atende: sessao.empresa?.adminAtende !== false }).catch(() => []));
      }
      const [lista, fechados, equipe] = await Promise.all(tarefas);
      if (!ctx.ativo()) return;
      servicosDoMes = lista;
      fechadosDoMes = fechados;
      if (equipe) tecnicos = equipe;
      desenhar();
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregarMes, topo());
    }
  }

  /** Serviços do mês já com o filtro de técnico aplicado. */
  const visiveis = () => (filtroTecnico ? servicosDoMes.filter((s) => servicoTemTecnico(s, filtroTecnico)) : servicosDoMes);

  // ---------------------------------------------------------------------------
  // Desenhar
  // ---------------------------------------------------------------------------
  function desenhar() {
    // Dias que já passaram também mostram o que foi concluído ou cancelado (é o que os pontos verde e amarelo indicam).
    const doHistorico = fechadosDoMes.filter((s) => s.dataAgendada instanceof Date && paraISO(s.dataAgendada) < hoje && (!filtroTecnico || servicoTemTecnico(s, filtroTecnico)));
    const grupos = agruparPorDia([...visiveis(), ...doHistorico]);
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
          ${calendarioDoMes({
    ano, mes, hoje, escolhido: diaEscolhido, acao: 'dia', pontos: pontosDoCalendario(), passado: (iso) => iso < hoje,
    complemento: (iso, ponto) => `${grupos[iso] ? `, ${agruparAgendamentos(grupos[iso]).length} visita(s)` : ''}${ponto === 'vermelho' ? ', dia lotado' : ''}`,
  })}
          ${usuario.admin && diaEscolhido >= hoje && botao({ texto: diaEscolhido === hoje ? 'Agendar hoje' : `Agendar em ${diaEscolhido.slice(8, 10)}/${diaEscolhido.slice(5, 7)}`, iconeNome: 'mais', acao: 'agendar-dia', bloco: true, id: 'botao-agendar' })}
        </section>

        <section class="pilha pilha--pequena" aria-label="Serviços do dia">
          ${tituloSecao(formatarDiaExtenso(diaEscolhido))}
          ${doDia.length === 0
    ? html`<div class="cartao">${estadoVazio({
      icone: 'agenda',
      titulo: 'Nenhum serviço neste dia.',
      texto: usuario.admin ? '' : 'Você não tem serviços neste dia.',
    })}</div>`
    : agruparAgendamentos(doDia).map((v) => cartaoDaVisita(v, { mostrarTecnico: usuario.admin, acoes: true, editar: usuario.admin }))}
        </section>
      </div>`);

    const filtro = raiz.querySelector('#form-filtro');
    if (filtro) aoEnviar(filtro, () => {});
  }

  /**
   * Os pontos do mês. O vermelho (dia lotado) é calculado só para o administrador e só com a lista de
   * técnicos carregada; é o dia em que não dá mais para começar nenhum serviço (a mesma regra do seletor
   * de dia e hora). Com o filtro de técnico ligado,
   * vale só para aquele técnico. Visitas de qualquer técnico entram na conta de quem está ocupado.
   */
  function pontosDoCalendario() {
    const pontos = pontosDoMes({
      expediente: expedienteDaEmpresa(sessao.empresa),
      ano,
      mes,
      duracaoMinima: menorDuracaoDosTipos(sessao.tipos),
      regras: regrasDaEmpresa(sessao.empresa),
      tecnicos,
      agendados: servicosDoMes,
      filtroTecnico,
      mostrarLotado: usuario.admin,
    });
    // Dias que já passaram contam o HISTÓRICO: verde = concluído; amarelo = atrasado ou cancelado (podem ser os dois).
    for (const iso of [...pontos.keys()]) if (iso < hoje) pontos.delete(iso);
    const historico = pontosDoHistorico({
      servicos: [...servicosDoMes, ...fechadosDoMes].filter((s) => !filtroTecnico || servicoTemTecnico(s, filtroTecnico)),
      ano, mes, hoje,
    });
    for (const [iso, cores] of historico) pontos.set(iso, cores);
    return pontos;
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

  /** + Agendar: tela flutuante com os horários e técnicos livres do dia; depois segue para escolher o cliente. */
  async function agendarNoDia(iso) {
    if (!iso || iso < hoje) return;
    const escolha = await abrirSeletorDeHorario({
      modo: 'folha', data: iso, hora: '', tecnicoUids: [],
      expediente: expedienteDaEmpresa(sessao.empresa),
      duracaoMin: DURACAO_PADRAO_MIN,
      duracaoMinima: menorDuracaoDosTipos(sessao.tipos),
      regras: regrasDaEmpresa(sessao.empresa),
      tecnicos,
      agendamentoId: null,
      carregarMes: (a, m) => listarAgendados({ empresaId: usuario.empresaId, de: new Date(a, m, 0), ate: new Date(a, m + 1, 2) }),
    });
    if (!escolha || !ctx.ativo()) return;
    diaDeVolta.iso = diaEscolhido; diaDeVolta.quando = Date.now();
    const q = new URLSearchParams({ agenda: '1', data: escolha.data, hora: escolha.hora, tecnicos: escolha.tecnicoUids.join(',') });
    ctx.ir(`/agendar?${q.toString()}`);
  }

  const desligar = aoClicar(raiz, {
    dia: (el) => {
      diaEscolhido = el.dataset.dia;
      desenhar();
    },
    'agendar-dia': () => agendarNoDia(diaEscolhido),
    'mes-anterior': () => irParaMes(-1),
    'mes-seguinte': () => irParaMes(1),
    navegar: (el) => {
      const servico = servicosDoMes.find((s) => s.id === el.dataset.id);
      if (servico) abrirNavegacao(servico);
    },
    // O administrador cancela (fica aguardando reagendamento) ou exclui a visita.
    'cancelar-visita': async (el) => {
      const linhas = servicosDoMes.filter((s) => chaveDoAgendamento(s) === el.dataset.chave);
      if (linhas.length === 0) return;
      if (!await confirmar({ titulo: 'Cancelar este agendamento?', mensagem: 'Ele fica "aguardando reagendamento" para você marcar outra data.', confirmar: 'Cancelar agendamento', cancelar: 'Voltar', perigo: true })) return;
      await comCarregando(el, async () => {
        try {
          await cancelarAgendamentoCompleto(usuario.empresaId, linhas);
          toast('Agendamento cancelado. Ele aguarda reagendamento.', 'sucesso');
          carregarMes();
        } catch (e) { mostrarErro(e); }
      });
    },
    'excluir-visita': async (el) => {
      const linhas = servicosDoMes.filter((s) => chaveDoAgendamento(s) === el.dataset.chave);
      if (linhas.length === 0) return;
      if (!await confirmar({ titulo: 'Excluir este agendamento?', mensagem: 'Apaga os dados deste agendamento. Não apaga o cliente, os aparelhos dele nem serviços já concluídos. Não dá para desfazer.', confirmar: 'Excluir agendamento', cancelar: 'Voltar', perigo: true })) return;
      await comCarregando(el, async () => {
        try {
          await excluirAgendamentoCompleto(usuario.empresaId, linhas);
          toast('Agendamento excluído.', 'sucesso');
          carregarMes();
        } catch (e) { mostrarErro(e); }
      });
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
