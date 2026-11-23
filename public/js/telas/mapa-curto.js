// =============================================================================
// /m/:codigo — link curto do mapa (Pacote 30): abre o Google Maps no endereço do cliente
// =============================================================================
// O link vai na mensagem de WhatsApp do técnico. A página lê o endereço guardado (vale 30 dias) e abre o Google Maps.
// O endereço de destino sempre vira um link do Google Maps montado pelo próprio app (nunca um endereço qualquer de fora).
// Se o link venceu ou não existe, avisa e leva para o início (o serviço tem o botão "Ir até o cliente").
// =============================================================================

import { html, mostrar } from '../nucleo/ui.js';
import { cabecalho, estadoVazio, botao, esqueletos } from '../nucleo/componentes.js';
import { lerLinkCurto } from '../servicos/links-curtos.js';
import { hrefGoogleMaps } from '../dominio/endereco.js';
import { mostrarErroComTentar } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz, params } = ctx;
  const topo = cabecalho({ titulo: 'Abrir o mapa' });
  mostrar(raiz, html`${topo}${esqueletos(1)}`);
  let achado;
  try {
    achado = await lerLinkCurto(params.codigo);
  } catch (erro) {
    if (ctx.ativo()) mostrarErroComTentar(raiz, erro, () => ctx.recarregar(), topo);
    return undefined;
  }
  if (!ctx.ativo()) return undefined;
  if (!achado || achado.tipo !== 'mapa' || achado.vencido || !achado.consulta) {
    mostrar(raiz, html`
      ${topo}
      ${estadoVazio({
        icone: 'alerta',
        titulo: 'Link do mapa vencido',
        texto: 'Este link não existe mais (valem 30 dias). Abra o serviço no app e toque em "Ir até o cliente".',
        acao: botao({ texto: 'Ir para o início', href: '#/', bloco: true }),
      })}`);
    return undefined;
  }
  const destino = hrefGoogleMaps(achado.consulta);
  mostrar(raiz, html`
    ${topo}
    <div class="pilha" data-mapa-curto>
      <p class="texto-suave">Abrindo o Google Maps…</p>
      ${botao({ texto: 'Abrir o Google Maps', href: destino, bloco: true })}
    </div>`);
  window.location.replace(destino);
  return () => {};
}
