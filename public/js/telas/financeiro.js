// =============================================================================
// TELA: Financeiro — só administrador
// =============================================================================
// Abas Hoje / Semana / Mês / Ano. Mostra recebido, a receber e quantidade de
// serviços; gráfico de barras; totais por tipo de serviço e por técnico; e a
// lista de concluídos SEM VALOR (feitos por técnicos) para o administrador
// preencher.
// Plano sem "financeiro completo": só o resumo de HOJE e um convite ao plano.
// Custo: cada serviço lido = 2 leituras (serviço + valor), por isso só o
// período escolhido é carregado.
// =============================================================================

import { html, mostrar, aoClicar } from '../nucleo/ui.js';
import { cabecalho, botao, abas, estadoVazio, esqueletos, aviso, itemLista } from '../nucleo/componentes.js';
import { resumoDoPlano } from '../nucleo/sessao.js';
import { carregarFinanceiro } from '../servicos/valores.js';
import { listarSemValor } from '../servicos/servicos.js';
import { formatarReais } from '../dominio/dinheiro.js';
import { formatarDataBR } from '../dominio/datas.js';
import { nomesDosTecnicos, dividirCentavos } from '../dominio/servicos.js';
import { mostrarFalha } from './_auxiliar-admin.js';

const ABAS = [
  { id: 'hoje', rotulo: 'Hoje' }, { id: 'semana', rotulo: 'Semana' },
  { id: 'mes', rotulo: 'Mês' }, { id: 'ano', rotulo: 'Ano' },
];

/**
 * Soma por técnico (visão do administrador) a partir dos serviços e valores do período.
 * Serviço com mais de um técnico: o valor é dividido igualmente entre eles (os centavos
 * que sobram vão para o primeiro) e o serviço conta para cada um.
 */
function totaisPorTecnico(servicos, valores) {
  const mapa = new Map();
  for (const s of servicos) {
    const nomes = nomesDosTecnicos(s).filter(Boolean);
    const lista = nomes.length > 0 ? nomes : [s.concluidoPorNome || 'Sem nome'];
    const partes = Number.isInteger(valores[s.id]) ? dividirCentavos(valores[s.id], lista.length) : null;
    lista.forEach((nome, i) => {
      const g = mapa.get(nome) || { nome, quantidade: 0, totalCentavos: 0 };
      g.quantidade += 1;
      if (partes) g.totalCentavos += partes[i];
      mapa.set(nome, g);
    });
  }
  return [...mapa.values()].sort((a, b) => b.totalCentavos - a.totalCentavos);
}

export default async function montar(ctx) {
  const { raiz, sessao } = ctx;
  const empresaId = sessao.vinculo.empresaId;
  const completo = resumoDoPlano()?.financeiroCompleto === true;
  const topo = cabecalho({ titulo: 'Financeiro', voltarPara: '#/' });
  let periodo = 'hoje';
  let semValor = [];

  async function carregar() {
    mostrar(raiz, html`${topo}${esqueletos(3)}`);
    try {
      const [dados, pendentes] = await Promise.all([
        carregarFinanceiro(empresaId, periodo),
        listarSemValor(empresaId).catch(() => []),
      ]);
      if (!ctx.ativo()) return;
      semValor = pendentes;
      desenhar(dados);
    } catch (erro) {
      if (ctx.ativo()) mostrarFalha(raiz, erro, carregar);
    }
  }

  function desenhar(d) {
    const r = d.resumo;
    const maiorBarra = Math.max(1, ...d.serie.map((b) => b.totalCentavos));
    const maiorTipo = Math.max(1, ...r.porTipo.map((t) => t.totalCentavos));
    const porTecnico = totaisPorTecnico(d.servicos, d.valores);
    const maiorTec = Math.max(1, ...porTecnico.map((t) => t.totalCentavos));

    mostrar(raiz, html`
      ${topo}
      <div class="pilha">
        ${completo ? abas(ABAS, periodo) : ''}
        <div class="cartao painel-numeros">
          <div class="financeiro-numero"><span class="financeiro-numero__rotulo">Recebido</span><span class="numero-grande valor-recebido">${formatarReais(r.recebidoCentavos)}</span></div>
          <div class="financeiro-numero"><span class="financeiro-numero__rotulo">A receber</span><span class="numero-medio valor-a-receber">${formatarReais(r.aReceberCentavos)}</span></div>
          <div class="financeiro-numero"><span class="financeiro-numero__rotulo">Serviços</span><span class="numero-medio">${r.quantidade}</span></div>
        </div>

        ${!completo ? aviso({ titulo: 'Financeiro completo', texto: html`Gráficos, totais por tipo e por técnico e os outros períodos estão nos planos pagos. ${botao({ texto: 'Ver planos', href: '#/plano', variante: 'secundario', pequeno: true })}` }) : ''}

        ${completo && d.serie.length > 0 ? html`
          <div class="cartao">
            <h2 class="titulo-secao">Faturamento</h2>
            <div class="grafico grafico--financeiro" role="img" aria-label="Gráfico de faturamento do período">
              ${d.serie.map((b) => html`
                <div class="grafico__coluna ${b.totalCentavos === 0 ? 'grafico__coluna--vazia' : ''}">
                  <div class="grafico__barra" data-altura="${Math.round((b.totalCentavos / maiorBarra) * 100)}"></div>
                  <span class="grafico__rotulo">${b.rotulo}</span>
                </div>`)}
            </div>
          </div>` : ''}

        ${completo && r.porTipo.length > 0 ? html`
          <div class="cartao pilha">
            <h2 class="titulo-secao">Por tipo de serviço</h2>
            ${r.porTipo.map((t) => html`
              <div class="linha-resumo">
                <div class="linha-resumo__topo"><span class="linha-resumo__nome">${t.nome} (${t.quantidade})</span><span class="linha-resumo__valor">${formatarReais(t.totalCentavos)}</span></div>
                <div class="barra-horizontal"><div class="barra-horizontal__preenchimento" data-largura="${Math.round((t.totalCentavos / maiorTipo) * 100)}"></div></div>
              </div>`)}
          </div>` : ''}

        ${completo && porTecnico.length > 1 ? html`
          <div class="cartao pilha">
            <h2 class="titulo-secao">Por técnico</h2>
            ${porTecnico.map((t) => html`
              <div class="linha-resumo">
                <div class="linha-resumo__topo"><span class="linha-resumo__nome">${t.nome} (${t.quantidade})</span><span class="linha-resumo__valor">${formatarReais(t.totalCentavos)}</span></div>
                <div class="barra-horizontal"><div class="barra-horizontal__preenchimento" data-largura="${Math.round((t.totalCentavos / maiorTec) * 100)}"></div></div>
              </div>`)}
          </div>` : ''}

        ${r.quantidade === 0 ? estadoVazio({ icone: 'dinheiro', titulo: 'Nenhum serviço concluído neste período', texto: 'Quando você concluir serviços, os valores aparecem aqui.' }) : ''}

        ${semValor.length > 0 ? html`
          <div class="cartao pilha">
            <h2 class="titulo-secao">Concluídos sem valor (${semValor.length})</h2>
            <p class="texto-suave texto-pequeno">Serviços feitos por técnicos. Toque para informar o valor.</p>
            <div class="lista pilha pilha--pequena">
              ${semValor.map((s) => itemLista({
                acao: 'valor', dados: { id: s.id },
                titulo: s.clienteNome, sub: `${s.tipoServicoNome} · ${formatarDataBR(s.dataConclusao)}`,
                direita: botao({ texto: 'Informar', variante: 'secundario', pequeno: true, acao: 'valor', dados: { id: s.id } }),
              }))}
            </div>
          </div>` : ''}
      </div>`);
  }

  aoClicar(raiz, {
    aba: (el) => { periodo = el.dataset.aba; carregar(); },
    valor: (el) => { location.hash = `#/servico/${encodeURIComponent(el.dataset.id)}/valor`; },
  });

  await carregar();
}
