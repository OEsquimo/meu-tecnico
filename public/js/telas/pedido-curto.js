// =============================================================================
// /p/:codigo — link curto do pedido do cliente ("Técnico: abrir no app") — só administrador
// =============================================================================
// Lê o pedido guardado (nome, WhatsApp, endereço, dia, hora, serviços) e abre o Agendar já preenchido, no mesmo
// formato do link comprido de antes (/agendar?pedido=1&...). Só o administrador da empresa consegue ler o pedido.
// =============================================================================

import { html, mostrar } from '../nucleo/ui.js';
import { cabecalho, estadoVazio, botao, esqueletos } from '../nucleo/componentes.js';

import { empresaId } from '../nucleo/sessao.js';
import { lerLinkCurto } from '../servicos/links-curtos.js';
import { lerPedidoDaConsulta } from '../dominio/link-horarios.js';
import { mostrarErroComTentar } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz, params } = ctx;
  const topo = cabecalho({ titulo: 'Pedido do cliente', voltarPara: '#/' });
  mostrar(raiz, html`${topo}${esqueletos(2)}`);
  let achado;
  try {
    achado = await lerLinkCurto(params.codigo);
  } catch (erro) {
    if (ctx.ativo()) mostrarErroComTentar(raiz, erro, () => ctx.recarregar(), topo);
    return undefined;
  }
  if (!ctx.ativo()) return undefined;
  const consulta = achado && achado.tipo === 'pedido' && achado.empresaId === empresaId() ? new URLSearchParams(achado.consulta) : null;
  if (!consulta || !lerPedidoDaConsulta(consulta)) {
    mostrar(raiz, html`
      ${topo}
      ${estadoVazio({
        icone: 'alerta',
        titulo: 'Pedido não encontrado',
        texto: 'Este link de pedido não existe, já venceu (valem 30 dias) ou é de outra empresa. Peça ao cliente para mandar o pedido de novo.',
        acao: botao({ texto: 'Ir para o início', href: '#/', bloco: true }),
      })}`);
    return undefined;
  }
  ctx.ir(`/agendar?${consulta.toString()}`, { substituir: true });
  return () => {};
}
