// =============================================================================
// Barra fixa "Em serviço" (Pacote 27) — só para o TÉCNICO, em todas as telas
// =============================================================================
// Aparece enquanto ele tem uma visita iniciada e ainda não concluída, com o botão Concluir.
// Atualiza ao trocar de tela, ao voltar para o app, a cada minuto e quando um serviço muda.
// Falhou ao ler? A barra só some; nunca atrapalha a tela.
// =============================================================================

import { html, mostrar } from '../nucleo/ui.js';
import { sessao } from '../nucleo/sessao.js';
import { ehTecnico } from '../nucleo/permissoes.js';
import { listarAgendados } from '../servicos/servicos.js';
import { agruparAgendamentos } from '../dominio/servicos.js';
import { inicioDoDiaSeguinte } from '../dominio/datas.js';
import { inicioDaVisita, linhasAbertas, horaDeCampo } from '../dominio/tempo-servico.js';
import { botao } from '../nucleo/componentes.js';
import { contextoDoUsuario } from './servicos-comum.js';

const INTERVALO_MS = 60000;
let ocupado = false;

/** A visita que está em andamento (iniciada e ainda aberta) mais antiga, ou null. */
export function visitaEmAndamento(linhas, uid) {
  const visitas = agruparAgendamentos(linhas)
    .map((v) => ({ v, inicio: inicioDaVisita(linhasAbertas(v.linhas, uid)) }))
    .filter((x) => x.inicio)
    .sort((a, b) => a.inicio - b.inicio);
  return visitas[0] || null;
}

export function iniciarBarraDeServico(elemento) {
  async function atualizar() {
    if (ocupado) return;
    const rota = (location.hash || '').replace(/^#/, '');
    const esconder = () => { elemento.hidden = true; document.body.classList.remove('com-barra-servico'); };
    if (sessao.estado !== 'pronto' || !ehTecnico(sessao) || rota.startsWith('/concluir')) { esconder(); return; }
    ocupado = true;
    try {
      const u = contextoDoUsuario();
      const lista = await listarAgendados({ empresaId: u.empresaId, ate: inicioDoDiaSeguinte(new Date()), tecnicoUid: u.uid });
      const atual = visitaEmAndamento(lista, u.uid);
      if (!atual) { esconder(); return; }
      const aberta = linhasAbertas(atual.v.linhas, u.uid)[0];
      mostrar(elemento, html`
        <div class="barra-servico__texto">
          <span class="barra-servico__titulo">Em serviço · ${atual.v.clienteNome}</span>
          <span class="barra-servico__sub">desde ${horaDeCampo(atual.inicio)}</span>
        </div>
        ${botao({ texto: 'Concluir', iconeNome: 'check', href: `#/concluir/${encodeURIComponent(aberta.id)}`, pequeno: true })}`);
      elemento.hidden = false;
      document.body.classList.add('com-barra-servico');
    } catch { /* sem barra desta vez */ } finally { ocupado = false; }
  }
  window.addEventListener('hashchange', atualizar);
  window.addEventListener('servico-mudou', atualizar);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') atualizar(); });
  setInterval(atualizar, INTERVALO_MS);
  return atualizar();
}
