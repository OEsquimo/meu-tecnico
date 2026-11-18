// =============================================================================
// PAINEL DE AVISOS PELO WHATSAPP (só administrador)
// =============================================================================
// Depois de agendar, reagendar ou cancelar, mostra um botão para o cliente e um para cada técnico (que tenha WhatsApp).
// O app NUNCA envia nada: o botão abre o WhatsApp com a mensagem pronta e a pessoa aperta enviar.
// Depois de tocado, o botão fica cinza (só um sinal; continua funcionando para enviar de novo). Nada é salvo.
// =============================================================================

import { html, criarJanela } from '../nucleo/ui.js';
import { sessao, empresaId as empresaIdAtual } from '../nucleo/sessao.js';
import { ehAdmin } from '../nucleo/permissoes.js';
import { TITULOS_DE_AVISO } from '../dominio/aviso-cliente.js';
import { montarDestinatarios } from '../dominio/destinatarios-aviso.js';
import { listarEquipe, tecnicosParaAtribuir } from '../servicos/equipe.js';
import { listarAgendados } from '../servicos/servicos.js';
import { expedienteDaEmpresa, regrasDaEmpresa } from '../dominio/expediente.js';
import { hojeISO, somarDias, deISO } from '../dominio/datas.js';
import { normalizarWhatsappBR } from '../dominio/telefone.js';
import { horariosLivresParaOLink, montarLinkDeHorarios, enderecoBaseDoApp, DIAS_A_FRENTE, DURACAO_SEM_SERVICO_MIN } from '../dominio/link-horarios.js';

let aberto = false;

/** Link para o cliente escolher outro dia e hora (o mesmo de Ferramentas). '' se não der para gerar. */
async function linkParaRemarcar() {
  try {
    const empresaId = empresaIdAtual();
    const whatsapp = normalizarWhatsappBR(sessao.vinculo?.telefone || '');
    if (!whatsapp || !empresaId) return '';
    const agora = new Date();
    const [tecnicos, agendados] = await Promise.all([
      tecnicosParaAtribuir(empresaId, { uid: sessao.usuario.uid, nome: sessao.vinculo?.nome || '', atende: sessao.empresa?.adminAtende !== false }),
      listarAgendados({ empresaId, de: deISO(somarDias(hojeISO(agora), -1)), ate: deISO(somarDias(hojeISO(agora), DIAS_A_FRENTE + 2)) }),
    ]);
    const dias = horariosLivresParaOLink({
      expediente: expedienteDaEmpresa(sessao.empresa), tecnicos, agendados, duracaoMin: DURACAO_SEM_SERVICO_MIN, regras: regrasDaEmpresa(sessao.empresa), agora,
    });
    if (dias.length === 0) return '';
    return montarLinkDeHorarios({ base: enderecoBaseDoApp(window.location.href), empresa: sessao.empresa?.nome || 'nossa empresa', whatsapp, servico: '', dias, geradoEm: hojeISO(agora) });
  } catch {
    return '';
  }
}

async function listarMembros(empresaId) {
  try { return await listarEquipe(empresaId); } catch { return []; }
}

/**
 * Abre o painel. Devolve quando a janela fechar. Não faz nada se não for administrador
 * ou se ninguém tiver WhatsApp para receber.
 * @param {'agendado'|'cancelado'|'reagendado'} tipo
 * @param {object[]} linhas  linhas da visita
 * @param {{ anterior?: Date }} [extra]
 */
export async function abrirAvisos(tipo, linhas, { anterior = null } = {}) {
  if (!ehAdmin(sessao) || aberto || !linhas || linhas.length === 0 || !linhas[0].dataAgendada) return;
  const empresaId = empresaIdAtual();
  aberto = true;
  try {
    const [equipe, linkRemarcar] = await Promise.all([
      listarMembros(empresaId),
      tipo === 'cancelado' ? linkParaRemarcar() : Promise.resolve(''),
    ]);
    const destinos = montarDestinatarios({
      tipo, empresa: sessao.empresa || {}, linhas, equipe, adminUid: sessao.usuario?.uid || '', anterior, linkRemarcar,
      baseApp: enderecoBaseDoApp(window.location.href),
    }).filter((d) => d.link);
    if (destinos.length === 0) return;
    await new Promise((resolver) => desenhar(tipo, destinos, resolver));
  } finally {
    aberto = false;
  }
}

const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';

function desenhar(tipo, destinos, resolver) {
  const janela = criarJanela();
  janela.setAttribute('data-avisos', '');
  janela.setAttribute('aria-labelledby', 'janela-titulo');
  const rotulo = (d) => (d.papel === 'Cliente' ? `Mensagem para ${primeiroNome(d.nome)}` : `Mensagem técnico ${primeiroNome(d.nome)}`);
  janela.innerHTML = String(html`
    <h2 id="janela-titulo">${TITULOS_DE_AVISO[tipo]}</h2>
    <p class="texto-suave">O app não envia nada sozinho: o WhatsApp abre com a mensagem pronta e você só aperta enviar.</p>
    <div class="avisos__botoes">
      ${destinos.map((d) => html`<a class="botao botao--bloco avisos__botao" href="${d.link}" target="_blank" rel="noopener noreferrer" data-abrir="${d.id}" title="${rotulo(d)}"><span class="avisos__rotulo">${rotulo(d)}</span></a>`)}
    </div>
    <div class="janela__acoes"><button type="button" class="botao botao--bloco botao--secundario" data-fechar>Fechar</button></div>`);
  janela.addEventListener('click', (e) => {
    if (e.target.closest('[data-fechar]')) { janela.close(); return; }
    const botao = e.target.closest('[data-abrir]');
    // Só muda a cor (sem redesenhar na hora, para não cancelar a abertura do WhatsApp).
    if (botao) setTimeout(() => botao.classList.add('avisos__botao--tocado'), 300);
  });
  janela.addEventListener('close', () => { janela.remove(); resolver(); });
  janela.showModal();
}
