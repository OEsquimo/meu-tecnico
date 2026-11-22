// =============================================================================
// Pacote 27 — peças de tela do TÉCNICO para início e conclusão do serviço
// =============================================================================
// - blocoDeTempo: o que aparece no cartão da visita (Iniciar, "Em serviço", os dois avisos).
// - acoesDeTempo: os cliques desses botões (para juntar no aoClicar de cada tela).
// Os dois avisos nunca aparecem juntos: só a primeira visita que precisa de atenção mostra um.
// =============================================================================

import { html, toast, mostrarErro, criarJanela, comCarregando, confirmar } from '../nucleo/ui.js';
import { botao, aviso, selo } from '../nucleo/componentes.js';
import { iniciarVisita, informarAtraso } from '../servicos/servicos.js';
import { situacaoDaVisita, validarHorarios, horaDeCampo, inicioDaVisita, MOTIVOS_ATRASO, FALTAS_ATRASO, linhasAbertas } from '../dominio/tempo-servico.js';
import { chaveDoAgendamento } from '../dominio/servicos.js';
import { combinarDataHora, paraISO } from '../dominio/datas.js';

/** Quanto antes do horário marcado o botão Iniciar já aparece. */
const ANTECEDENCIA_INICIAR_MIN = 60;
/** "Ainda não cheguei" some por este tempo e a pergunta volta. */
const ADIAR_PERGUNTA_MS = 15 * 60000;
const adiadas = new Map(); // chave da visita -> quando a pergunta pode voltar

/** Primeira visita (na ordem da lista) que precisa de uma resposta agora; só ela mostra aviso. */
export function visitaQuePrecisaDeResposta(visitas, uid, agora = new Date()) {
  for (const v of visitas) {
    const s = situacaoDaVisita(v.linhas, agora, uid);
    if (s === 'esperando-concluir') return chaveDoAgendamento(v.linhas[0]);
    if (s === 'perguntar-inicio' && (adiadas.get(chaveDoAgendamento(v.linhas[0])) || 0) <= agora.getTime()) return chaveDoAgendamento(v.linhas[0]);
  }
  return null;
}

/**
 * Pedaço do cartão: devolve { situacao, selo, corpo, botaoIniciar }.
 * tempo: { uid, agora, chaveAviso }
 */
export function blocoDeTempo(linhas, tempo) {
  const { uid, agora, chaveAviso } = tempo;
  const situacao = situacaoDaVisita(linhas, agora, uid);
  const chave = chaveDoAgendamento(linhas[0]);
  const inicio = inicioDaVisita(linhasAbertas(linhas, uid));
  const marcado = linhasAbertas(linhas, uid).map((l) => l.dataAgendada).filter((d) => d instanceof Date).sort((a, b) => a - b)[0];
  const r = { situacao, selo: null, corpo: null, botaoIniciar: null };
  if (situacao === 'em-servico') {
    r.selo = selo(inicio ? `Em serviço desde ${horaDeCampo(inicio)}` : 'Em serviço', 'verde');
  } else if (situacao === 'esperando-concluir') {
    r.selo = selo('Esperando concluir', 'amarelo');
    if (chaveAviso === chave) {
      r.corpo = html`<div class="aviso-tempo" data-aviso="esperando-concluir">
        ${aviso({ tom: 'amarelo', titulo: 'Serviço esperando concluir', texto: 'O horário previsto já passou. Você já terminou?' })}
        <div class="acoes-cartao">
          ${botao({ texto: 'Já terminei', iconeNome: 'check', acao: 'ja-terminei', dados: { chave }, pequeno: true })}
          ${botao({ texto: 'Ainda estou no serviço', variante: 'secundario', acao: 'ainda-no-servico', dados: { chave }, pequeno: true })}
        </div>
      </div>`;
    }
  } else if (situacao === 'perguntar-inicio' && chaveAviso === chave) {
    r.corpo = html`<div class="aviso-tempo" data-aviso="perguntar-inicio">
      ${aviso({ tom: 'amarelo', titulo: 'Você já começou?', texto: 'O horário marcado já passou.' })}
      <div class="acoes-cartao">
        ${botao({ texto: 'Sim, iniciar agora', iconeNome: 'check', acao: 'iniciar-agora', dados: { chave }, pequeno: true })}
        ${botao({ texto: 'Comecei às…', variante: 'secundario', acao: 'comecei-as', dados: { chave }, pequeno: true })}
        ${botao({ texto: 'Ainda não cheguei', variante: 'secundario', acao: 'ainda-nao-cheguei', dados: { chave }, pequeno: true })}
      </div>
    </div>`;
  }
  const hoje = marcado && paraISO(marcado) === paraISO(agora);
  const perto = marcado && agora.getTime() >= marcado.getTime() - ANTECEDENCIA_INICIAR_MIN * 60000;
  if (situacao === 'agendado' && hoje && perto) {
    r.botaoIniciar = botao({ texto: 'Iniciar serviço', iconeNome: 'relogio', acao: 'iniciar-agora', dados: { chave }, pequeno: true });
  }
  return r;
}

/** Janela com um campo de hora. Devolve "HH:MM" ou null. Só aceita hora que já passou. */
function pedirHoraDeInicio({ valor }) {
  return new Promise((resolver) => {
    const janela = criarJanela();
    janela.innerHTML = String(html`
      <h2>A que horas você começou?</h2>
      <div class="campo"><input class="campo__entrada" type="time" value="${valor}" aria-label="Hora de início" data-hora />
        <p class="campo__erro" data-erro hidden></p></div>
      <div class="janela__acoes">
        <button type="button" class="botao botao--bloco" data-resposta="sim">Salvar início</button>
        <button type="button" class="botao botao--bloco botao--secundario" data-resposta="nao">Voltar</button>
      </div>`);
    let resposta = null;
    janela.addEventListener('click', (e) => {
      const b = e.target.closest('[data-resposta]');
      if (!b) return;
      if (b.dataset.resposta === 'sim') {
        const v = janela.querySelector('[data-hora]').value;
        const hora = /^\d{2}:\d{2}$/.test(v) ? v : '';
        const erro = janela.querySelector('[data-erro]');
        const data = hora ? combinarDataHora(paraISO(new Date()), hora) : null;
        if (!data) { erro.textContent = 'Informe a hora de início.'; erro.hidden = false; return; }
        if (data.getTime() > Date.now()) { erro.textContent = 'Esse horário ainda não chegou.'; erro.hidden = false; return; }
        resposta = hora;
      }
      janela.close();
    });
    janela.addEventListener('close', () => { janela.remove(); resolver(resposta); });
    janela.showModal();
  });
}

/** "Ainda estou no serviço": motivo (obrigatório), detalhe e quanto tempo falta. Devolve { motivo, detalhe, falta } ou null. */
function pedirMotivoEPrazo() {
  return new Promise((resolver) => {
    const janela = criarJanela();
    janela.innerHTML = String(html`
      <h2>Ainda estou no serviço</h2>
      <div class="campo"><span class="campo__rotulo">Motivo do atraso</span>
        <div class="chips" role="radiogroup" aria-label="Motivo do atraso">
          ${MOTIVOS_ATRASO.map((m) => html`<label class="chip"><input type="radio" name="motivo" value="${m}" /><span class="chip__texto">${m}</span></label>`)}
        </div>
        <p class="campo__erro" data-erro-motivo hidden>Escolha o motivo do atraso.</p></div>
      <div class="campo"><input class="campo__entrada" type="text" maxlength="300" placeholder="Detalhe (opcional)" aria-label="Detalhe do atraso" data-detalhe /></div>
      <div class="campo"><span class="campo__rotulo">Quanto tempo falta?</span>
        <div class="chips" role="radiogroup" aria-label="Quanto tempo falta">
          ${FALTAS_ATRASO.map((f, i) => html`<label class="chip"><input type="radio" name="falta" value="${f.valor}" ${i === 1 ? html`checked` : ''} /><span class="chip__texto">${f.rotulo}</span></label>`)}
        </div></div>
      <p class="texto-suave texto-pequeno">O administrador será avisado.</p>
      <div class="janela__acoes">
        <button type="button" class="botao botao--bloco" data-resposta="sim">Avisar</button>
        <button type="button" class="botao botao--bloco botao--secundario" data-resposta="nao">Voltar</button>
      </div>`);
    let resposta = null;
    janela.addEventListener('click', (e) => {
      const b = e.target.closest('[data-resposta]');
      if (!b) return;
      if (b.dataset.resposta === 'sim') {
        const motivo = janela.querySelector('input[name="motivo"]:checked')?.value;
        if (!motivo) { janela.querySelector('[data-erro-motivo]').hidden = false; return; }
        resposta = {
          motivo, detalhe: janela.querySelector('[data-detalhe]').value.trim(),
          falta: janela.querySelector('input[name="falta"]:checked')?.value || '30',
        };
      }
      janela.close();
    });
    janela.addEventListener('close', () => { janela.remove(); resolver(resposta); });
    janela.showModal();
  });
}

/**
 * Cliques dos botões de tempo. achar(chave) devolve as linhas da visita; recarregar() redesenha a tela.
 * Juntar no mapa do aoClicar da tela.
 */
export function acoesDeTempo({ usuario, achar, recarregar, ir }) {
  const gravar = async (el, funcao, mensagem) => {
    await comCarregando(el, async () => {
      try { await funcao(); if (mensagem) toast(mensagem, 'sucesso'); recarregar(); } catch (e) { mostrarErro(e); }
    });
  };
  return {
    'iniciar-agora': (el) => gravar(el, () => iniciarVisita({ empresaId: usuario.empresaId, linhas: achar(el.dataset.chave), uid: usuario.uid, inicio: new Date() }), 'Serviço iniciado.'),
    'comecei-as': async (el) => {
      const hora = await pedirHoraDeInicio({ valor: horaDeCampo(new Date()) });
      if (!hora) return;
      await gravar(el, () => iniciarVisita({ empresaId: usuario.empresaId, linhas: achar(el.dataset.chave), uid: usuario.uid, inicio: combinarDataHora(paraISO(new Date()), hora) }), 'Início registrado.');
    },
    'ainda-nao-cheguei': (el) => { adiadas.set(el.dataset.chave, Date.now() + ADIAR_PERGUNTA_MS); recarregar(); },
    'ja-terminei': (el) => {
      const abertas = linhasAbertas(achar(el.dataset.chave), usuario.uid);
      if (abertas[0]) ir(`/concluir/${encodeURIComponent(abertas[0].id)}`);
    },
    'ainda-no-servico': async (el) => {
      const r = await pedirMotivoEPrazo();
      if (!r) return;
      await gravar(el, () => informarAtraso({ empresaId: usuario.empresaId, linhas: achar(el.dataset.chave), uid: usuario.uid, ...r }), 'O administrador foi avisado.');
    },
  };
}

/**
 * ADMINISTRADOR: janela para corrigir início, conclusão (e o dia) de um serviço concluído, com o motivo do atraso.
 * Os erros bloqueiam dentro da janela; casos estranhos (muito curto, muito longo, sobreposição) pedem confirmação.
 * Devolve { inicio: Date, conclusao: Date, atraso: {motivo, detalhe}|null } ou null.
 */
export function pedirCorrecaoDeHorarios({ servico }) {
  return new Promise((resolver) => {
    const janela = criarJanela();
    const conc = servico.dataConclusao instanceof Date ? servico.dataConclusao : new Date();
    const ini = servico.iniciadoEm instanceof Date ? servico.iniciadoEm : null;
    janela.innerHTML = String(html`
      <h2>Corrigir horários</h2>
      <p class="texto-suave texto-pequeno">O Financeiro usa o dia da conclusão informado aqui.</p>
      <div class="campo"><label class="campo__rotulo" for="corr-dia">Dia</label><input class="campo__entrada" id="corr-dia" type="date" value="${paraISO(conc)}" data-dia /><p class="campo__erro" data-erro="dia" hidden></p></div>
      <div class="campo"><label class="campo__rotulo" for="corr-ini">Início</label><input class="campo__entrada" id="corr-ini" type="time" value="${ini ? horaDeCampo(ini) : ''}" data-inicio /><p class="campo__erro" data-erro="inicio" hidden></p></div>
      <div class="campo"><label class="campo__rotulo" for="corr-fim">Conclusão</label><input class="campo__entrada" id="corr-fim" type="time" value="${horaDeCampo(conc)}" data-conclusao /><p class="campo__erro" data-erro="conclusao" hidden></p></div>
      <div class="campo"><span class="campo__rotulo">Motivo do atraso (opcional)</span>
        <div class="chips" role="radiogroup" aria-label="Motivo do atraso">
          ${MOTIVOS_ATRASO.map((m) => html`<label class="chip"><input type="radio" name="motivo" value="${m}" ${servico.atrasoMotivo === m ? html`checked` : ''} /><span class="chip__texto">${m}</span></label>`)}
        </div></div>
      <div class="campo"><input class="campo__entrada" type="text" maxlength="300" placeholder="Detalhe (opcional)" aria-label="Detalhe do atraso" value="${servico.atrasoDetalhe || ''}" data-detalhe /></div>
      <div class="janela__acoes">
        <button type="button" class="botao botao--bloco" data-resposta="sim">Salvar horários</button>
        <button type="button" class="botao botao--bloco botao--secundario" data-resposta="nao">Voltar</button>
      </div>`);
    let resposta = null;
    janela.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-resposta]');
      if (!b) return;
      if (b.dataset.resposta === 'sim') {
        const h = validarHorarios({
          diaISO: janela.querySelector('[data-dia]').value, inicio: janela.querySelector('[data-inicio]').value,
          conclusao: janela.querySelector('[data-conclusao]').value, agora: new Date(),
        });
        for (const campo of ['dia', 'inicio', 'conclusao']) {
          const el = janela.querySelector(`[data-erro="${campo}"]`);
          el.textContent = h.erros[campo] || '';
          el.hidden = !h.erros[campo];
        }
        if (!h.valido) return;
        for (const c of h.confirmacoes) {
          // eslint-disable-next-line no-await-in-loop
          if (!await confirmar({ titulo: 'Confira os horários', mensagem: c.texto, confirmar: 'Está certo', cancelar: 'Corrigir' })) return;
        }
        const motivo = janela.querySelector('input[name="motivo"]:checked')?.value || '';
        resposta = { inicio: h.inicio, conclusao: h.conclusao, atraso: motivo ? { motivo, detalhe: janela.querySelector('[data-detalhe]').value.trim() } : null };
      }
      janela.close();
    });
    janela.addEventListener('close', () => { janela.remove(); resolver(resposta); });
    janela.showModal();
  });
}
