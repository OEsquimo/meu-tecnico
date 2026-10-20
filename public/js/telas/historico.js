// =============================================================================
// TELA: Histórico (serviços concluídos)
// =============================================================================
// Lista dos concluídos mais recentes, com busca por cliente/tipo/técnico.
// O técnico vê só os dele e nunca vê valores.
// =============================================================================

import { html, mostrar, esperarDigitar } from '../nucleo/ui.js';
import { cabecalho, itemLista, estadoVazio, esqueletos, selo } from '../nucleo/componentes.js';
import { textoParaBusca } from '../nucleo/ui-texto.js';
import { listarHistorico } from '../servicos/servicos.js';
import { formatarDataBR } from '../dominio/datas.js';
import { LIMITE_HISTORICO } from '../nucleo/constantes.js';
import { carregarEstilos, contextoDoUsuario, mostrarErroComTentar } from './servicos-comum.js';

export default async function montar(ctx) {
  const { raiz } = ctx;
  const usuario = contextoDoUsuario();
  const topo = cabecalho({ titulo: 'Histórico', subtitulo: 'Serviços concluídos' });

  async function carregar() {
    mostrar(raiz, html`${topo}${esqueletos(4)}`);
    try {
      await carregarEstilos();
      const lista = await listarHistorico({ empresaId: usuario.empresaId, tecnicoUid: usuario.admin ? null : usuario.uid });
      if (!ctx.ativo()) return;
      desenhar(lista);
    } catch (erro) {
      if (ctx.ativo()) mostrarErroComTentar(raiz, erro, carregar, topo);
    }
  }

  function desenhar(lista) {
    mostrar(raiz, html`
      ${topo}
      <div class="pilha">
        <div class="campo"><input class="campo__entrada" id="busca" type="search" placeholder="Buscar cliente, serviço ou técnico" aria-label="Buscar" /></div>
        <div id="resultado" class="lista pilha pilha--pequena"></div>
        ${lista.length >= LIMITE_HISTORICO ? html`<p class="texto-suave texto-pequeno">Mostrando os ${LIMITE_HISTORICO} mais recentes.</p>` : ''}
      </div>`);

    const alvo = raiz.querySelector('#resultado');
    const filtrar = (termo) => {
      const t = textoParaBusca(termo);
      const achados = t ? lista.filter((s) => textoParaBusca(`${s.clienteNome} ${s.tipoServicoNome} ${s.tecnicoNome || ''} ${s.aparelhoResumo || ''}`).includes(t)) : lista;
      mostrar(alvo, achados.length === 0
        ? estadoVazio({ icone: 'relogio', titulo: lista.length ? 'Nada encontrado' : 'Nenhum serviço concluído ainda', texto: lista.length ? 'Tente outro nome.' : 'Quando você concluir serviços, eles aparecem aqui.' })
        : html`${achados.map((s) => itemLista({
          href: `#/servico/${s.id}`,
          titulo: s.clienteNome,
          sub: `${s.tipoServicoNome} · ${formatarDataBR(s.dataConclusao)}${s.tecnicoNome ? ` · ${s.tecnicoNome}` : ''}`,
          direita: usuario.admin && s.valorDefinido === false ? selo('Sem valor', 'amarelo') : (s.pago ? selo('Pago', 'verde') : selo('A receber', 'amarelo')),
        }))}`);
    };
    filtrar('');
    raiz.querySelector('#busca').addEventListener('input', esperarDigitar((e) => filtrar(e.target.value)));
  }

  await carregar();
}
