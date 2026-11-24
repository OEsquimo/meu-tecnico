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

import { html, mostrar, aoClicar, comCarregando, mostrarErro, toast } from '../nucleo/ui.js';
import { cabecalho, botao, estadoVazio, esqueletos, campoSelecao } from '../nucleo/componentes.js';
import { listarServicosDaLista, listarAReceber, buscarServico, registrarCobranca, registrarRecebimentoDaVisita } from '../servicos/servicos.js';
import { PAGINA_SERVICOS } from '../nucleo/constantes.js';
import { formatarMesAno } from '../dominio/datas.js';
import { agruparConcluidos } from '../dominio/servicos.js';
import {
  STATUS_DA_LISTA, STATUS_PADRAO_DA_LISTA, statusValido, usaFiltroDeMes, ehAReceber, mesVizinho, ordenarAgendados, haMais,
} from '../dominio/lista-servicos.js';
import { sessao } from '../nucleo/sessao.js';
import { formatarReais } from '../dominio/dinheiro.js';
import { formatarDataBR } from '../dominio/datas.js';
import { totaisAReceber, distribuirRecebimento } from '../dominio/pagamentos.js';
import { montarCobranca, modeloDaEmpresa } from '../dominio/cobranca.js';
import { linkWhatsappDoCliente } from '../dominio/whatsapp.js';
import { pedirPagamento } from './pagamento-comum.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar, cartaoDaVisita } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz } = ctx;
  const usuario = contextoDoUsuario();
  const topo = cabecalho({ titulo: 'Serviços', subtitulo: 'Todos os serviços, por situação e período' });

  const hoje = new Date();
  const consultaStatus = ctx.consulta?.get('status');
  const estado = { status: consultaStatus === 'a-receber' ? 'a-receber' : STATUS_PADRAO_DA_LISTA, ano: hoje.getFullYear(), mes: hoje.getMonth(), limite: PAGINA_SERVICOS };
  let lista = [];
  let aReceber = { cartoes: [], truncado: false };
  let leitura = 0; // descarta respostas antigas se o usuário mudar o filtro rápido

  async function ler() {
    const minha = ++leitura;
    if (ehAReceber(estado.status)) {
      const r = await listarAReceber({ empresaId: usuario.empresaId });
      if (minha !== leitura || !ctx.ativo()) return false;
      aReceber = r;
      return true;
    }
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

  /** Pacote 31: um cartão por visita com o que falta receber. */
  function cartaoAReceber(c) {
    const pode = c.cobraveis.length > 0 && Boolean(c.whatsapp);
    const dica = c.cobraveis.length === 0 ? 'Informe o valor do serviço para cobrar.' : (!c.whatsapp ? 'Este cliente não tem WhatsApp cadastrado.' : '');
    return html`
      <div class="cartao" data-a-receber="${c.chave}">
        <div class="visita-cartao__linha">
          <div class="item-lista__titulo visita-cartao__nome">${c.clienteNome}</div>
          <div class="servico-cartao__hora">${c.dataServico ? formatarDataBR(c.dataServico) : ''}</div>
        </div>
        ${c.atraso && html`<div class="item-lista__sub">Serviço feito ${c.atraso}</div>`}
        <div class="visita-obs">
          ${c.itens.map((i) => html`<div class="item-lista__sub">${i.servico}${i.aparelho ? ` (${i.aparelho})` : ''} · ${i.semValor ? 'Valor não informado' : (i.parcial ? `${formatarReais(i.valorCentavos)} · pagou ${formatarReais(i.pagoCentavos)} · falta ${formatarReais(i.saldoCentavos)}` : formatarReais(i.valorCentavos))}</div>`)}
        </div>
        <div class="item-lista__titulo" data-divida>${c.dividaCentavos > 0 ? `Deve ${formatarReais(c.dividaCentavos)}` : 'Valor não informado'}</div>
        ${c.cobradoEm && html`<div class="item-lista__sub">Cobrado em ${formatarDataBR(c.cobradoEm)}</div>`}
        <div class="acoes-cartao">
          ${botao({ texto: 'Abrir serviço', variante: 'secundario', href: `#/servico/${encodeURIComponent(c.abrirId)}`, pequeno: true })}
          ${botao({ texto: 'Cobrar cliente', variante: 'whatsapp', iconeNome: 'whatsapp', acao: 'cobrar-cliente', dados: { chave: c.chave }, pequeno: true, desabilitado: !pode })}
          ${c.cobraveis.length > 0 && botao({ texto: 'Recebi', variante: 'secundario', acao: 'recebi-cartao', dados: { chave: c.chave }, pequeno: true })}
        </div>
        ${dica && html`<p class="texto-pequeno texto-suave">${dica}</p>`}
      </div>`;
  }

  function desenharAReceber() {
    const t = totaisAReceber(aReceber.cartoes);
    mostrar(raiz, html`
      ${topo}
      <div class="pilha">
        <div><div class="rotulo-pequeno">Status</div>
          ${campoSelecao({ nome: 'status', rotulo: 'Status', valor: estado.status, opcoes: STATUS_DA_LISTA.map((o) => ({ valor: o.valor, rotulo: o.rotulo })) })}
        </div>
        ${aReceber.cartoes.length === 0
    ? html`<div class="cartao">${estadoVazio({ icone: 'dinheiro', titulo: 'Ninguém está devendo', texto: 'Todos os serviços concluídos já foram pagos.' })}</div>`
    : html`<div class="cartao" data-total-a-receber><strong>Total a receber: ${formatarReais(t.dividaCentavos)}</strong> · ${t.clientes} ${t.clientes === 1 ? 'cliente' : 'clientes'}
          ${t.servicosSemValor > 0 && html`<div class="texto-pequeno texto-suave">${t.servicosSemValor} serviço(s) sem valor informado não entram na soma.</div>`}</div>
        <div class="lista" id="itens">${aReceber.cartoes.map(cartaoAReceber)}</div>`}
        ${aReceber.truncado && html`<p class="texto-pequeno texto-suave">Há muitos serviços em aberto e só parte deles está na lista. Quite alguns para ver os demais.</p>`}
      </div>`);
    const rotuloRepetido = raiz.querySelector('[data-campo="status"] .campo__rotulo');
    if (rotuloRepetido) rotuloRepetido.classList.add('so-leitor');
  }

  function desenhar() {
    if (ehAReceber(estado.status)) return desenharAReceber();
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
    'cobrar-cliente': (el) => {
      const c = aReceber.cartoes.find((x) => x.chave === el.dataset.chave);
      if (!c || c.cobraveis.length === 0) return;
      const e = sessao.empresa || {};
      const texto = montarCobranca(modeloDaEmpresa(e), {
        nome: String(c.clienteNome || '').split(' ')[0], empresa: e.nome, pix: e.chavePix,
        itens: c.cobraveis.map((i) => ({ servico: i.servico, aparelho: i.aparelho, data: i.data, centavos: i.saldoCentavos })),
      });
      const link = linkWhatsappDoCliente(c.whatsapp, texto);
      if (!link) { toast('Este cliente não tem WhatsApp cadastrado.', 'erro'); return; }
      window.open(link, '_blank', 'noopener');
      registrarCobranca(usuario.empresaId, c.cobraveis.map((i) => i.id)).then(() => trocar({})).catch(mostrarErro);
    },
    'recebi-cartao': async (el) => {
      const c = aReceber.cartoes.find((x) => x.chave === el.dataset.chave);
      if (!c) return;
      const itens = c.cobraveis.map((i) => ({ id: i.id, nome: i.servico, saldoCentavos: i.saldoCentavos }));
      const r = await pedirPagamento({
        titulo: 'Recebi um valor', saldoMaximoCentavos: c.dividaCentavos,
        explicacao: 'O app abate dos serviços na ordem em que aparecem.',
        previsao: (v) => distribuirRecebimento(itens, v).divisao.map((d) => `${itens.find((x) => x.id === d.id).nome}: ${formatarReais(d.centavos)}${d.quita ? ' (quita)' : ''}`).join(' · '),
      });
      if (!r) return;
      await comCarregando(el, async () => {
        try {
          const ids = c.cobraveis.map((i) => i.id);
          const linhas = (await Promise.all(ids.map((id) => buscarServico(usuario.empresaId, id)))).filter(Boolean);
          await registrarRecebimentoDaVisita(usuario.empresaId, linhas, r);
          toast('Pagamento registrado.', 'sucesso');
          await trocar({});
        } catch (e) { mostrarErro(e); }
      });
    },
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
