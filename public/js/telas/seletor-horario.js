// =============================================================================
// SELETOR DE DIA, HORA E TÉCNICOS (tela cheia)
// =============================================================================
// Usado em Agendar, Editar agendamento e Reagendar. Uma tela só, numa coluna:
//   1) calendário do mês (o mesmo da Agenda: ponto azul = dia com agendamento em que ainda dá para começar
//      outro serviço; ponto vermelho = dia LOTADO (não dá para começar nenhum), e ao tocar avisa que não há
//      horário livre; dia fechado ou que já passou: apagado e desligado);
//   2) horários livres do dia escolhido (o serviço começa dentro do expediente e pode terminar depois:
//      aparece um aviso discreto de hora extra);
//   3) técnicos livres naquele horário (marca um ou mais).
// Devolve { data, hora, tecnicoUids } ou null se a pessoa fechar sem confirmar.
// Só carrega os agendamentos do mês que está na tela (e guarda os que já buscou).
// A conta de "quem está livre" é a de dominio/disponibilidade.js (testada sem tela).
// =============================================================================

import { html, aoClicar } from '../nucleo/ui.js';
import { botao } from '../nucleo/componentes.js';
import { icone } from '../nucleo/icones.js';
import { mesVizinho } from '../dominio/agenda.js';
import { calendarioDoMes } from './calendario-comum.js';
import { diaTemInicioPelaFrente, diasComVaga, diasLotados, horariosLivresDoDia, pontosDoMes } from '../dominio/disponibilidade.js';
import { DURACAO_PADRAO_MIN } from '../nucleo/constantes.js';
import { fimDepoisDoExpediente } from '../dominio/expediente.js';
import { ehISOValido, formatarDiaExtenso, formatarMesAno, hojeISO } from '../dominio/datas.js';

/**
 * @param {object} p
 * @param {string} p.data            dia já escolhido ('' se nenhum)
 * @param {string} p.hora            hora já escolhida ('' se nenhuma)
 * @param {string[]} p.tecnicoUids   técnicos já escolhidos
 * @param {object} p.expediente      horário de funcionamento (dominio/expediente.js)
 * @param {number} p.duracaoMin      quanto tempo o técnico fica ocupado
 * @param {object|null} p.regras      almoço e limite de horas por dia (dominio/expediente.js, regrasDaEmpresa)
 * @param {number} p.duracaoMinima   o menor serviço cadastrado (a medida do "dia lotado", igual à da Agenda)
 * @param {Array<{uid:string,nome:string}>} p.tecnicos  todos os técnicos que podem atender
 * @param {string|null} p.agendamentoId  agendamento em edição (não conta como ocupado)
 * @param {(ano:number, mes:number) => Promise<object[]>} p.carregarMes  agendados em volta do mês
 * @param {() => Date} [p.agora]     relógio (para testes)
 */
export function abrirSeletorDeHorario({ data, hora, tecnicoUids, expediente, duracaoMin, duracaoMinima = DURACAO_PADRAO_MIN, regras = null, tecnicos, agendamentoId = null, carregarMes, agora = () => new Date() }) {
  return new Promise((resolver) => {
    const hoje = hojeISO(agora());
    const inicial = ehISOValido(data) && data >= hoje ? data : hoje;
    const [anoInicial, mesInicial] = inicial.split('-').map(Number);
    let ano = anoInicial;
    let mes = mesInicial - 1;
    let diaEscolhido = ehISOValido(data) && data >= hoje ? data : '';
    let horaEscolhida = diaEscolhido ? hora : '';
    let escolhidos = new Set(tecnicoUids || []);
    let carregando = true;
    let erroDeCarga = false;
    let agendados = [];
    let resposta = null;
    const guardados = new Map(); // "ano-mes" -> agendados do mês
    let pedido = 0;

    const janela = document.createElement('dialog');
    janela.className = 'janela janela--cheia seletor';
    janela.setAttribute('aria-label', 'Escolher dia e horário');
    document.body.appendChild(janela);

    const contaBase = () => ({ expediente, duracaoMin, tecnicos, agendados, ignorarAgendamento: agendamentoId, regras, agora: agora() });
    const horariosDoDiaEscolhido = () => (diaEscolhido ? horariosLivresDoDia({ ...contaBase(), iso: diaEscolhido }) : []);
    const techsDaHora = () => horariosDoDiaEscolhido().find((h) => h.hora === horaEscolhida)?.tecnicos || [];

    async function irParaMes(novoAno, novoMes) {
      ano = novoAno; mes = novoMes;
      const chave = `${ano}-${mes}`;
      const meu = ++pedido;
      erroDeCarga = false;
      // O dia escolhido só vale dentro do mês que está na tela (os horários livres vêm dos agendamentos desse mês).
      if (diaEscolhido && !diaEscolhido.startsWith(`${ano}-${String(mes + 1).padStart(2, '0')}-`)) { diaEscolhido = ''; horaEscolhida = ''; escolhidos = new Set(); }
      if (guardados.has(chave)) { agendados = guardados.get(chave); carregando = false; conferirEscolha(); desenhar(); return; }
      carregando = true;
      desenhar();
      try {
        const lista = await carregarMes(ano, mes);
        if (meu !== pedido) return; // chegou resposta mais nova
        guardados.set(chave, lista);
        agendados = lista;
      } catch {
        if (meu !== pedido) return;
        agendados = [];
        erroDeCarga = true;
      }
      carregando = false;
      conferirEscolha();
      desenhar();
    }

    /** O horário que veio escolhido pode já não estar livre (passou, ou outro agendamento tomou). Limpa o que não vale mais. */
    function conferirEscolha() {
      if (!diaEscolhido || !horaEscolhida) return;
      if (!horariosDoDiaEscolhido().some((h) => h.hora === horaEscolhida)) { horaEscolhida = ''; escolhidos = new Set(); return; }
      ajustarTecnicos();
    }

    /** Ao trocar de horário: mantém os técnicos marcados que continuam livres; se não sobrou nenhum, marca o primeiro livre. */
    function ajustarTecnicos() {
      const livres = techsDaHora();
      escolhidos = new Set([...escolhidos].filter((uid) => livres.some((t) => t.uid === uid)));
      if (escolhidos.size === 0 && livres[0]) escolhidos.add(livres[0].uid);
    }

    function calendario() {
      const pronto = !carregando && !erroDeCarga;
      const pontos = pronto ? pontosDoMes({ ...contaBase(), duracaoMinima, ano, mes, mostrarLotado: true }) : new Map();
      const comVaga = pronto ? diasComVaga({ ...contaBase(), ano, mes }) : new Set();
      // Dia fechado ou que já passou: apagado. Os demais dá para tocar (se não couber este serviço, a tela explica).
      const desligado = (iso) => !diaTemInicioPelaFrente(expediente, iso, agora());
      const complemento = (iso, ponto) => (comVaga.has(iso) ? ', com horário livre' : (ponto === 'vermelho' ? ', dia lotado, sem horário livre' : ', sem horário livre para este serviço'));
      return calendarioDoMes({ ano, mes, hoje, escolhido: diaEscolhido, pontos, acao: 'seletor-dia', desligado, complemento });
    }

    function desenhar() {
      const horarios = carregando ? [] : horariosDoDiaEscolhido();
      const livres = carregando ? [] : techsDaHora();
      const pode = Boolean(diaEscolhido && horaEscolhida && escolhidos.size > 0 && livres.length > 0);
      const mesAnterior = mesVizinho(ano, mes, -1);
      const antesDeHoje = `${mesAnterior.ano}-${String(mesAnterior.mes + 1).padStart(2, '0')}` < hoje.slice(0, 7);
      const diaLotadoEscolhido = Boolean(diaEscolhido) && !carregando && !erroDeCarga
        && diasLotados({ ...contaBase(), duracaoMinima, ano, mes }).has(diaEscolhido);
      const horaExtra = horaEscolhida ? fimDepoisDoExpediente(expediente, diaEscolhido, horaEscolhida, duracaoMin) : null;
      const semVagaNoMes = !carregando && !erroDeCarga && diasComVaga({ ...contaBase(), ano, mes }).size === 0;
      janela.innerHTML = String(html`
        <header class="seletor__topo">
          <button type="button" class="cabecalho__voltar" data-acao="seletor-fechar" aria-label="Fechar">${icone('voltar', 24)}</button>
          <h2 class="seletor__titulo">Escolher dia e horário</h2>
        </header>
        <div class="seletor__corpo">
          <div class="seletor__mes" data-ano-mes="${ano}-${String(mes + 1).padStart(2, '0')}">
            <button type="button" class="botao botao--secundario botao--pequeno" data-acao="seletor-mes" data-passo="-1" aria-label="Mês anterior" ${antesDeHoje ? html`disabled` : ''}>‹</button>
            <strong>${formatarMesAno(ano, mes)}</strong>
            <button type="button" class="botao botao--secundario botao--pequeno" data-acao="seletor-mes" data-passo="1" aria-label="Próximo mês">›</button>
          </div>
          ${carregando ? html`<p class="texto-suave" role="status">Carregando os horários livres…</p>` : ''}
          ${erroDeCarga ? html`<div class="aviso aviso--amarelo" role="alert">Não deu para ver os horários deste mês. Toque em ‹ ou › para tentar de novo.</div>` : ''}
          ${calendario()}
          ${semVagaNoMes ? html`<p class="texto-suave">Nenhum dia com horário livre neste mês. Veja o mês seguinte.</p>` : ''}
          ${diaEscolhido && !carregando ? html`
            <section class="seletor__secao" data-secao="horarios">
              <h3 class="subtitulo">${formatarDiaExtenso(diaEscolhido)}</h3>
              ${horarios.length === 0
    ? html`<p class="texto-suave">${diaLotadoEscolhido ? 'Nenhum horário livre neste dia.' : 'Nenhum horário livre neste dia para este serviço. Escolha outro dia.'}</p>`
    : html`<div class="seletor__horarios">${horarios.map((h) => html`<button type="button" class="seletor__horario ${h.hora === horaEscolhida ? 'seletor__horario--escolhido' : ''}" data-acao="seletor-hora" data-hora="${h.hora}" aria-pressed="${h.hora === horaEscolhida}">${h.hora}</button>`)}</div>
      ${horaExtra ? html`<p class="seletor__aviso-extra" data-aviso="hora-extra">Termina ${horaExtra.startsWith('depois') ? horaExtra : `às ${horaExtra}`}, depois do expediente.</p>` : ''}`}
            </section>` : ''}
          ${horaEscolhida && livres.length > 0 ? html`
            <section class="seletor__secao" data-secao="tecnicos">
              <h3 class="subtitulo">Técnicos livres às ${horaEscolhida}</h3>
              <div class="tecnicos-caixas">
                ${livres.map((t) => html`
                  <label class="tecnico-opcao">
                    <input type="checkbox" name="seletor-tec" value="${t.uid}" ${escolhidos.has(t.uid) ? 'checked' : ''} />
                    <span>${t.nome}</span>
                  </label>`)}
              </div>
              <p class="campo__ajuda">Marque mais de um se forem juntos.</p>
            </section>` : ''}
        </div>
        <footer class="seletor__rodape">
          ${botao({ texto: 'Confirmar', acao: 'seletor-confirmar', bloco: true, desabilitado: !pode })}
        </footer>`);
    }

    function fechar(valor) {
      resposta = valor;
      janela.close();
    }

    const desligar = aoClicar(janela, {
      'seletor-fechar': () => fechar(null),
      'seletor-mes': (el) => { const v = mesVizinho(ano, mes, Number(el.dataset.passo)); irParaMes(v.ano, v.mes); },
      'seletor-dia': (el) => {
        diaEscolhido = el.dataset.iso;
        const aindaServe = horariosDoDiaEscolhido().some((h) => h.hora === horaEscolhida);
        if (!aindaServe) { horaEscolhida = ''; escolhidos = new Set(); }
        desenhar();
      },
      'seletor-hora': (el) => { horaEscolhida = el.dataset.hora; ajustarTecnicos(); desenhar(); },
      'seletor-confirmar': () => {
        if (!diaEscolhido || !horaEscolhida || escolhidos.size === 0) return;
        const livres = techsDaHora().map((t) => t.uid);
        fechar({ data: diaEscolhido, hora: horaEscolhida, tecnicoUids: [...escolhidos].filter((uid) => livres.includes(uid)) });
      },
    });
    janela.addEventListener('change', (e) => {
      if (e.target.name !== 'seletor-tec') return;
      escolhidos = new Set([...janela.querySelectorAll('input[name="seletor-tec"]:checked')].map((c) => c.value));
      const botaoConfirmar = janela.querySelector('[data-acao="seletor-confirmar"]');
      if (botaoConfirmar) botaoConfirmar.disabled = escolhidos.size === 0;
    });
    janela.addEventListener('cancel', () => { resposta = null; }); // tecla Esc / botão voltar do celular
    janela.addEventListener('close', () => {
      desligar();
      janela.remove();
      resolver(resposta);
    });

    desenhar();
    janela.showModal();
    irParaMes(ano, mes);
  });
}
