// =============================================================================
// TELA: Desempenho (/desempenho) — só administrador
// =============================================================================
// Por técnico: serviços concluídos, tempo médio, atrasos, retornos e deslocamento médio.
// Tocando num técnico: o desempenho POR TIPO DE SERVIÇO (um técnico pode ser rápido em um e lento em outro),
// comparado com a equipe (só com 3 ou mais serviços do tipo), e os motivos dos atrasos.
// Contas em dominio/desempenho.js. Serviços sem início e conclusão confirmados ou com mais de 12 h ficam fora das médias.
// =============================================================================

import { html, mostrar, aoClicar } from '../nucleo/ui.js';
import { cabecalho, abas, estadoVazio, esqueletos, itemLista, selo, aviso, botao } from '../nucleo/componentes.js';
import { sessao } from '../nucleo/sessao.js';
import { tecnicosParaAtribuir } from '../servicos/equipe.js';
import { listarConcluidosDoPeriodo } from '../servicos/valores.js';
import { regrasDaEmpresa } from '../dominio/expediente.js';
import { periodoDe } from '../dominio/financeiro.js';
import { desempenhoDaEquipe } from '../dominio/desempenho.js';
import { textoDeMinutos } from '../dominio/tempo-servico.js';
import { mostrarFalha } from './_auxiliar-admin.js';
import { carregarEstilos, contextoDoUsuario } from './servicos-comum.js';

const ABAS = [{ id: 'semana', rotulo: 'Semana' }, { id: 'mes', rotulo: 'Mês' }, { id: 'ano', rotulo: 'Ano' }];

export default async function montar(ctx) {
  const { raiz } = ctx;
  const usuario = contextoDoUsuario();
  let periodo = 'mes';
  let equipe = null;
  let escolhido = null; // uid do técnico aberto
  const topo = cabecalho({ titulo: 'Desempenho', subtitulo: 'Tempo, atrasos e deslocamento da equipe', voltarPara: '#/administrativa' });

  async function carregar() {
    mostrar(raiz, html`${topo}${esqueletos(3)}`);
    try {
      await carregarEstilos();
      const p = periodoDe(periodo, new Date());
      const [tecnicos, concluidos] = await Promise.all([
        tecnicosParaAtribuir(usuario.empresaId, { uid: usuario.uid, nome: usuario.nome, atende: sessao.empresa?.adminAtende !== false }),
        listarConcluidosDoPeriodo(usuario.empresaId, p.inicio, p.fim),
      ]);
      if (!ctx.ativo()) return;
      equipe = desempenhoDaEquipe({ tecnicos, concluidos, almoco: regrasDaEmpresa(sessao.empresa).almoco });
      desenhar();
    } catch (erro) {
      if (ctx.ativo()) mostrarFalha(raiz, erro, carregar);
    }
  }

  const minutos = (m) => (m === null || m === undefined ? '—' : textoDeMinutos(m));

  function desenhar() {
    const d = escolhido ? equipe.tecnicos.find((t) => t.uid === escolhido) : null;
    mostrar(raiz, d ? detalhe(d) : lista());
  }

  function lista() {
    const r = equipe.resumo;
    return html`
      ${topo}
      <div class="pilha">
        ${abas(ABAS, periodo)}
        <div class="cartao painel-numeros" data-resumo="equipe">
          <div class="financeiro-numero"><span class="financeiro-numero__rotulo">Concluídos</span><span class="numero-medio">${r.concluidos}</span></div>
          <div class="financeiro-numero"><span class="financeiro-numero__rotulo">Tempo médio</span><span class="numero-medio">${minutos(r.tempoMedio)}</span></div>
          <div class="financeiro-numero"><span class="financeiro-numero__rotulo">Atrasos</span><span class="numero-medio">${r.atrasos}</span></div>
        </div>
        ${equipe.tecnicos.length === 0
    ? estadoVazio({ icone: 'clientes', titulo: 'Nenhum técnico', texto: 'Cadastre a equipe para ver o desempenho.' })
    : html`<div class="lista pilha pilha--pequena">
          ${equipe.tecnicos.map((t) => itemLista({
            acao: 'tecnico', dados: { uid: t.uid }, avatarNome: t.nome, titulo: t.nome,
            sub: `${t.concluidos} concluído(s) · tempo médio ${minutos(t.tempoMedio)} · ${t.atrasos} atraso(s)${t.horariosAplicaveis > 0 ? ` · horários informados ${t.horariosInformados} de ${t.horariosAplicaveis}` : ''}`,
          }))}
        </div>`}
        <p class="texto-suave texto-pequeno" data-nota="medias">As médias usam só serviços com início e conclusão informados e conferidos, de até 12 horas. Os outros contam como concluídos (e no Financeiro), mas ficam fora das médias.</p>
      </div>`;
  }

  function detalhe(t) {
    return html`
      ${cabecalho({ titulo: t.nome, subtitulo: 'Desempenho no período' })}
      <div class="pilha">
        ${botao({ texto: 'Voltar para a equipe', variante: 'secundario', acao: 'voltar-lista', pequeno: true })}
        ${abas(ABAS, periodo)}
        <div class="cartao pilha pilha--pequena" data-resumo="tecnico">
          <div class="linha linha--entre"><span>Serviços concluídos</span><strong>${t.concluidos}</strong></div>
          <div class="linha linha--entre"><span>Tempo médio no cliente</span><strong>${minutos(t.tempoMedio)}</strong></div>
          <div class="linha linha--entre"><span>Atrasos</span><strong>${t.atrasos}</strong></div>
          <div class="linha linha--entre" data-linha="horarios-informados"><span>Horários informados</span><strong>${t.horariosAplicaveis > 0 ? `${t.horariosInformados} de ${t.horariosAplicaveis} serviços` : '—'}</strong></div>
          <div class="linha linha--entre"><span>Retornos</span><strong>${t.retornos}</strong></div>
          <div class="linha linha--entre"><span>Deslocamento médio</span><strong>${minutos(t.deslocamentoMedio)}</strong></div>
        </div>
        <div class="cartao pilha" data-resumo="por-tipo">
          <h2 class="titulo-secao">Por tipo de serviço</h2>
          ${t.porTipo.length === 0 ? html`<p class="texto-suave">Nenhum serviço neste período.</p>` : t.porTipo.map((p) => html`
            <div class="linha-resumo">
              <div class="linha-resumo__topo"><span class="linha-resumo__nome">${p.nome} (${p.feitos})</span><span class="linha-resumo__valor">${minutos(p.tempoMedio)}</span></div>
              <div class="item-lista__sub">${p.comparacao ? selo(p.comparacao.texto, p.comparacao.tom) : 'Poucos serviços para comparar'}${p.equipeMedio !== null && p.comparacao ? ` · equipe ${minutos(p.equipeMedio)}` : ''}</div>
            </div>`)}
        </div>
        ${t.naoConferidos > 0 ? aviso({ tom: 'amarelo', texto: `${t.naoConferidos} serviço(s) foram concluídos sem conferir os horários e ficam fora das médias. Vale lembrar o técnico de tocar em Iniciar ou conferir os horários ao concluir.` }) : ''}
        ${t.motivos.length > 0 ? html`
          <div class="cartao pilha pilha--pequena" data-resumo="motivos">
            <h2 class="titulo-secao">Motivos dos atrasos</h2>
            ${t.motivos.map((m) => html`<div class="linha linha--entre"><span>${m.motivo}</span><strong>${m.total}</strong></div>`)}
          </div>` : ''}
        ${aviso({ texto: 'Deslocamento é o tempo entre concluir uma visita e iniciar a próxima no mesmo dia, sem o almoço. Intervalos de mais de 2 horas ficam fora.' })}
      </div>`;
  }

  aoClicar(raiz, {
    aba: (el) => { periodo = el.dataset.aba; carregar(); },
    tecnico: (el) => { escolhido = el.dataset.uid; desenhar(); window.scrollTo(0, 0); },
    'voltar-lista': () => { escolhido = null; desenhar(); },
  });

  await carregar();
}
