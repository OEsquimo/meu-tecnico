// =============================================================================
// TELA: Serviços (/servicos) — só administrador
// =============================================================================
// Uma lista de todos os serviços por situação, escolhida num menu suspenso:
// Agendados (padrão), Concluídos, Cancelados, Pendentes, Reagendados e Todos.
//   * Agendados: "a partir de hoje" (sem filtro de mês). Os atrasados vêm primeiro,
//     com o selo "Atrasado"; depois o que será feito primeiro (hoje antes de amanhã).
//   * Demais situações: um mês de cada vez (setas), do mais recente ao mais antigo.
//   * 30 serviços por vez; no fim, "Ver mais 30" (some quando não há mais).
//   * Um cartão por AGENDAMENTO (pacote 22): cliente, status, hora/dia, endereço, serviço(s) e técnico(s). Tocar abre a página do agendamento.
// Excluídos não aparecem (ao excluir, o agendamento é apagado de vez).
// =============================================================================

import { html, mostrar, aoClicar, comCarregando, mostrarErro } from '../nucleo/ui.js';
import { cabecalho, botao, estadoVazio, esqueletos, campoSelecao } from '../nucleo/componentes.js';
import { listarServicosDaLista } from '../servicos/servicos.js';
import { PAGINA_SERVICOS } from '../nucleo/constantes.js';
import { formatarMesAno } from '../dominio/datas.js';
import { agruparConcluidos } from '../dominio/servicos.js';
import {
  STATUS_DA_LISTA, STATUS_PADRAO_DA_LISTA, statusValido, usaFiltroDeMes, mesVizinho, ordenarAgendados, haMais,
} from '../dominio/lista-servicos.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar, cartaoDaVisita } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz } = ctx;
  const usuario = contextoDoUsuario();
  const topo = cabecalho({ titulo: 'Serviços', subtitulo: 'Todos os serviços, por situação e período' });

  const hoje = new Date();
  const estado = { status: STATUS_PADRAO_DA_LISTA, ano: hoje.getFullYear(), mes: hoje.getMonth(), limite: PAGINA_SERVICOS };
  let lista = [];
  let leitura = 0; // descarta respostas antigas se o usuário mudar o filtro rápido

  async function ler() {
    const minha = ++leitura;
    const dados = await listarServicosDaLista({ empresaId: usuario.empresaId, ...estado });
    if (minha !== leitura || !ctx.ativo()) return false;
    lista = estado.status === 'agendado' ? ordenarAgendados(dados) : dados;
    return true;
  }

  async function carregar() {
    mostrar(raiz, html`${topo}${esqueletos(4)}`);
    try {
      await carregarEstilos();
      if (await ler()) desenhar();
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, topo);
    }
  }

  function blocoDoPeriodo() {
    if (!usaFiltroDeMes(estado.status)) {
      return html`<div><div class="rotulo-pequeno">Período</div>
        <div class="periodo"><div class="periodo__centro"><div class="periodo__titulo">A partir de hoje</div><div class="periodo__sub">Todos os agendamentos que ainda não foram feitos</div></div></div></div>`;
    }
    return html`<div><div class="rotulo-pequeno">Período</div>
      <div class="periodo">
        <button type="button" class="periodo__seta" data-acao="mes-anterior" aria-label="Mês anterior">‹</button>
        <div class="periodo__centro"><div class="periodo__titulo" id="periodo-titulo">${formatarMesAno(estado.ano, estado.mes)}</div><div class="periodo__sub">Use as setas para mudar o mês</div></div>
        <button type="button" class="periodo__seta" data-acao="mes-seguinte" aria-label="Próximo mês">›</button>
      </div></div>`;
  }

  function desenhar() {
    const temMais = haMais(lista.length, estado.limite);
    mostrar(raiz, html`
      ${topo}
      <div class="pilha">
        <div><div class="rotulo-pequeno">Status</div>
          ${campoSelecao({ nome: 'status', rotulo: 'Status', valor: estado.status, opcoes: STATUS_DA_LISTA.map((o) => ({ valor: o.valor, rotulo: o.rotulo })) })}
        </div>
        ${blocoDoPeriodo()}
        ${lista.length === 0
    ? html`<div class="cartao">${estadoVazio({
      icone: 'agenda',
      titulo: 'Nenhum serviço aqui',
      texto: usaFiltroDeMes(estado.status) ? 'Não há serviços nesta situação neste mês. Tente outro mês.' : 'Não há agendamentos em aberto.',
    })}</div>`
    : html`<div class="lista" id="itens">${agruparConcluidos(lista).map((g) => cartaoDaVisita(g, { mostrarData: true }))}</div>`}
        ${temMais ? botao({ texto: `Ver mais ${PAGINA_SERVICOS}`, variante: 'secundario', acao: 'ver-mais', bloco: true }) : ''}
        ${!temMais && lista.length > 0 ? html`<p class="fim-da-lista">Fim da lista</p>` : ''}
      </div>`);
    const rotuloRepetido = raiz.querySelector('[data-campo="status"] .campo__rotulo');
    if (rotuloRepetido) rotuloRepetido.classList.add('so-leitor');
  }

  async function trocar(mudanca) {
    Object.assign(estado, mudanca, { limite: PAGINA_SERVICOS });
    try {
      if (await ler()) desenhar();
    } catch (e) { mostrarErro(e); }
  }

  const aoAlterar = (e) => {
    if (e.target?.name !== 'status') return;
    trocar({ status: statusValido(e.target.value) });
  };
  raiz.addEventListener('change', aoAlterar);

  const desligar = aoClicar(raiz, {
    'mes-anterior': () => trocar(mesVizinho(estado, -1)),
    'mes-seguinte': () => trocar(mesVizinho(estado, 1)),
    'ver-mais': (el) => comCarregando(el, async () => {
      estado.limite += PAGINA_SERVICOS;
      try {
        if (await ler()) desenhar();
      } catch (e) { estado.limite -= PAGINA_SERVICOS; mostrarErro(e); }
    }),
  });

  await carregar();
  return () => { raiz.removeEventListener('change', aoAlterar); desligar(); };
}
