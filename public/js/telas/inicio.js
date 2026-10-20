// =============================================================================
// TELA: Início
// =============================================================================
// ADMINISTRADOR: "próximo serviço" em destaque, 6 atalhos (Agenda, Clientes,
// Retornos com bolinha vermelha, Histórico, Financeiro, Administrativa) e uma
// faixa de avisos (plano/teste vencendo, serviços atrasados).
// TÉCNICO: "Meus serviços" de hoje e atrasados (só os dele, sem valores) e
// atalhos para Agenda, Histórico (e Clientes, se o administrador liberou).
//
// Padrão: mostra esqueleto ao carregar; se der erro, "Tentar de novo".
// =============================================================================

import { html, mostrar, aoClicar } from '../nucleo/ui.js';
import { cabecalho, botao, aviso, estadoVazio, esqueletos } from '../nucleo/componentes.js';
import { icone } from '../nucleo/icones.js';
import { sessao, situacaoAtual, resumoDoPlano } from '../nucleo/sessao.js';
import { podeGerirClientes } from '../nucleo/permissoes.js';
import { DIAS_AVISO_RETORNO_PADRAO } from '../nucleo/constantes.js';
import { listarAgendados, listarAtrasados, contarRetornos } from '../servicos/servicos.js';
import { inicioDoDia, inicioDoDiaSeguinte, formatarDiaExtenso, formatarHora, formatarDataBR, hojeISO, diasEntre, paraISO } from '../dominio/datas.js';
import { fimDoTeste } from '../dominio/planos.js';
import { estaAtrasado } from '../dominio/servicos.js';
import { carregarEstilos, contextoDoUsuario, primeiroNome, mostrarErroComTentar, cartaoDoServico, abrirNavegacao, tituloSecao } from './servicos-comum.js';

/** Quantos dias antes do fim do teste/plano o aviso aparece. */
const DIAS_AVISO_PLANO = 7;

export default async function montar(ctx) {
  const { raiz } = ctx;
  const usuario = contextoDoUsuario();
  const topo = cabecalho({ titulo: `Olá, ${primeiroNome(usuario.nome) || 'bem-vindo'}`, subtitulo: formatarDiaExtenso(new Date()) });
  let servicosNaTela = []; // serviços desenhados (para o botão "Ir até o cliente")

  // Os cliques são ligados UMA vez; os dados são redesenhados a cada carga.
  const desligar = aoClicar(raiz, {
    navegar: (el) => {
      const servico = servicosNaTela.find((s) => s.id === el.dataset.id);
      if (servico) abrirNavegacao(servico);
    },
  });

  async function carregar() {
    mostrar(raiz, html`${topo}${esqueletos(3)}`);
    try {
      await carregarEstilos();
      if (usuario.admin) await carregarAdmin();
      else await carregarTecnico();
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, topo);
    }
  }

  // ---------------------------------------------------------------------------
  // ADMINISTRADOR
  // ---------------------------------------------------------------------------
  async function carregarAdmin() {
    const agora = new Date();
    const hoje = inicioDoDia(agora);
    const diasAviso = sessao.empresa?.diasAvisoRetorno ?? DIAS_AVISO_RETORNO_PADRAO;

    // Retornos e atrasados não podem derrubar a tela inteira: se falharem, só somem.
    const [doDia, atrasados, retornos] = await Promise.all([
      listarAgendados({ empresaId: usuario.empresaId, de: hoje, ate: inicioDoDiaSeguinte(agora) }),
      listarAtrasados({ empresaId: usuario.empresaId, agora }).catch(() => []),
      contarRetornos({ empresaId: usuario.empresaId, hojeISO: hojeISO(agora), diasAviso }).catch(() => 0),
    ]);

    // Próximo serviço: o primeiro de hoje que ainda não passou; senão, o primeiro dos próximos dias.
    let proximo = doDia.find((s) => s.dataAgendada.getTime() >= agora.getTime()) || null;
    if (!proximo) {
      const futuros = await listarAgendados({ empresaId: usuario.empresaId, de: inicioDoDiaSeguinte(agora) }).catch(() => []);
      proximo = futuros[0] || null;
    }
    if (!ctx.ativo()) return;

    servicosNaTela = proximo ? [proximo] : [];
    // Atrasados = antes de hoje OU hoje com horário que já passou.
    const totalAtrasados = atrasados.length + doDia.filter((s) => estaAtrasado(s, agora)).length;

    mostrar(raiz, html`
      ${topo}
      <div class="pilha">
        ${avisosDoAdmin(totalAtrasados)}
        ${blocoProximo(proximo, doDia.length)}
        <div class="atalhos">
          ${atalho('#/agenda', 'agenda', 'Agenda', 'Calendário e serviços')}
          ${atalho('#/clientes', 'clientes', 'Clientes', 'Cadastro e aparelhos')}
          ${atalho('#/retornos', 'sino', 'Retornos', 'Quem já deve voltar', retornos)}
          ${atalho('#/historico', 'relogio', 'Histórico', 'Serviços concluídos')}
          ${atalho('#/financeiro', 'grafico', 'Financeiro', 'Quanto você ganhou')}
          ${atalho('#/administrativa', 'ajustes', 'Administrativa', 'Equipe, plano e mais')}
        </div>
      </div>`);
  }

  /** Faixa de avisos: plano/teste vencendo e serviços atrasados. */
  function avisosDoAdmin(totalAtrasados) {
    const avisos = [];
    const situacao = situacaoAtual();
    const empresa = sessao.empresa;
    const agora = new Date();
    const resumo = resumoDoPlano();
    if (situacao === 'vencida') {
      avisos.push(avisoLink('#/plano', 'vermelho', 'Seu plano venceu', 'Renove para voltar a cadastrar clientes. Seus dados continuam guardados.'));
    } else if (situacao === 'teste') {
      const dias = diasEntre(paraISO(agora), paraISO(fimDoTeste(empresa, sessao.regras)));
      if (dias <= DIAS_AVISO_PLANO) {
        avisos.push(avisoLink('#/plano', 'amarelo', 'Seu teste grátis está acabando', dias <= 0 ? 'Termina hoje. Toque para ver os planos.' : `Faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}. Toque para ver os planos.`));
      }
    } else if (situacao === 'ativa' && empresa.planoAte instanceof Date) {
      const dias = diasEntre(paraISO(agora), paraISO(empresa.planoAte));
      if (dias <= DIAS_AVISO_PLANO) {
        avisos.push(avisoLink('#/plano', 'amarelo', `Seu plano ${resumo?.plano?.nome || ''} vence em breve`, `Vence em ${formatarDataBR(empresa.planoAte)}. Toque para renovar.`));
      }
    }
    if (totalAtrasados > 0) {
      avisos.push(avisoLink('#/agenda', 'vermelho', totalAtrasados === 1 ? '1 serviço atrasado' : `${totalAtrasados} serviços atrasados`, 'O horário já passou e ainda não foram concluídos.'));
    }
    return avisos;
  }

  /** "Próximo serviço" em destaque (ou convite para agendar). */
  function blocoProximo(s, totalHoje) {
    if (!s) {
      return html`<div class="cartao">
        ${estadoVazio({
          icone: 'agenda',
          titulo: 'Nenhum serviço agendado',
          texto: 'Quando você agendar um serviço, ele aparece aqui.',
          acao: botao({ texto: 'Agendar serviço', iconeNome: 'mais', href: '#/agendar' }),
        })}
      </div>`;
    }
    const ehHoje = paraISO(s.dataAgendada) === hojeISO();
    return html`
      <section class="cartao cartao--destaque pilha pilha--pequena" aria-label="Próximo serviço">
        <div class="texto-suave texto-pequeno negrito">
          Próximo serviço · ${ehHoje ? 'hoje' : formatarDiaExtenso(s.dataAgendada)}${totalHoje > 1 && ehHoje ? ` (${totalHoje} hoje)` : ''}
        </div>
        <a class="servico-cartao__corpo" href="#/servico/${s.id}">
          <div class="servico-cartao__hora">${formatarHora(s.dataAgendada)}</div>
          <div class="expande">
            <div class="item-lista__titulo">${s.clienteNome}</div>
            <div class="item-lista__sub">${s.tipoServicoNome}${s.aparelhoResumo ? ` · ${s.aparelhoResumo}` : ''}</div>
            ${s.local && html`<div class="item-lista__sub">${s.local}</div>`}
            ${s.tecnicoNome && html`<div class="item-lista__sub">Técnico: ${s.tecnicoNome}</div>`}
          </div>
        </a>
        <div class="acoes-cartao">
          ${botao({ texto: 'Ir até o cliente', variante: 'secundario', iconeNome: 'navegar', acao: 'navegar', dados: { id: s.id }, pequeno: true })}
          ${botao({ texto: 'Ver serviço', href: `#/servico/${s.id}`, pequeno: true })}
        </div>
      </section>`;
  }

  // ---------------------------------------------------------------------------
  // TÉCNICO
  // ---------------------------------------------------------------------------
  async function carregarTecnico() {
    const agora = new Date();
    // Uma consulta só: tudo dele que está agendado até o fim de hoje (atrasados + hoje).
    const lista = await listarAgendados({ empresaId: usuario.empresaId, ate: inicioDoDiaSeguinte(agora), tecnicoUid: usuario.uid });
    if (!ctx.ativo()) return;
    servicosNaTela = lista;
    const inicioHoje = inicioDoDia(agora).getTime();
    const antigos = lista.filter((s) => s.dataAgendada.getTime() < inicioHoje);
    const hoje = lista.filter((s) => s.dataAgendada.getTime() >= inicioHoje);

    mostrar(raiz, html`
      ${topo}
      <div class="pilha">
        ${antigos.length > 0 && html`
          <section class="pilha pilha--pequena" aria-label="Serviços atrasados">
            ${tituloSecao('Atrasados')}
            ${antigos.map((s) => cartaoDoServico(s, { mostrarData: true, acoes: true }))}
          </section>`}
        <section class="pilha pilha--pequena" aria-label="Serviços de hoje">
          ${tituloSecao('Hoje')}
          ${hoje.length === 0
    ? html`<div class="cartao">${estadoVazio({ icone: 'agenda', titulo: 'Nada para hoje', texto: 'Você não tem serviços agendados para hoje. Veja a agenda para os próximos dias.', acao: botao({ texto: 'Abrir agenda', variante: 'secundario', href: '#/agenda' }) })}</div>`
    : hoje.map((s) => cartaoDoServico(s, { acoes: true }))}
        </section>
        <div class="atalhos">
          ${atalho('#/agenda', 'agenda', 'Agenda', 'Meus próximos serviços')}
          ${atalho('#/historico', 'relogio', 'Histórico', 'O que já concluí')}
          ${podeGerirClientes(sessao) ? atalho('#/clientes', 'clientes', 'Clientes', 'Cadastro e aparelhos') : ''}
        </div>
      </div>`);
  }

  await carregar();
  return desligar;
}

// -----------------------------------------------------------------------------
// PEDAÇOS DE TELA
// -----------------------------------------------------------------------------

/** Atalho quadrado. "contagem" > 0 mostra a bolinha vermelha. */
function atalho(href, nomeIcone, titulo, sub, contagem = 0) {
  return html`
    <a class="atalho" href="${href}">
      <span class="atalho__icone">${icone(nomeIcone, 22)}</span>
      <span class="atalho__titulo">${titulo}</span>
      <span class="atalho__sub">${sub}</span>
      ${contagem > 0 && html`<span class="bolinha" aria-label="${contagem} pendentes">${contagem > 99 ? '99+' : contagem}</span>`}
    </a>`;
}

/** Aviso inteiro clicável. */
function avisoLink(href, tom, titulo, texto) {
  return html`<a class="aviso-link" href="${href}">${aviso({ tom, titulo, texto })}</a>`;
}
