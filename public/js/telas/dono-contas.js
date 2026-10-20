// =============================================================================
// TELA: Painel do dono — Contas (empresas)
// =============================================================================
// Lista as empresas (busca por nome/e-mail). Ao abrir uma, o dono pode:
// trocar o plano, ativar/renovar +30 dias (após receber o Pix), estender o
// teste e bloquear/desbloquear. O dono NÃO vê clientes nem serviços das empresas.
// =============================================================================

import { html, mostrar, aoClicar, esperarDigitar, comCarregando, toast, confirmar, escolher, mostrarErro } from '../nucleo/ui.js';
import { cabecalho, botao, itemLista, selo, estadoVazio, esqueletos, listaDeDados, campoSelecao } from '../nucleo/componentes.js';
import { textoParaBusca } from '../nucleo/ui-texto.js';
import { listarEmpresas, listarPlanos, lerRegras, atualizarContaDaEmpresa, novaValidade } from '../servicos/planos.js';
import { situacaoConta, rotuloSituacao, fimDoTeste } from '../dominio/planos.js';
import { formatarDataBR } from '../dominio/datas.js';
import { REGRAS_PADRAO } from '../nucleo/constantes.js';
import { mostrarFalha, seloSituacao, seta } from './_auxiliar-admin.js';

export default async function montar(ctx) {
  const { raiz } = ctx;
  const topo = cabecalho({ titulo: 'Contas', subtitulo: 'Empresas que usam o app' });
  let empresas = [];
  let planos = [];
  let regras = REGRAS_PADRAO;

  async function carregar() {
    mostrar(raiz, html`${topo}${esqueletos(4)}`);
    try {
      [empresas, planos, regras] = await Promise.all([listarEmpresas(), listarPlanos(), lerRegras().then((r) => r || REGRAS_PADRAO).catch(() => REGRAS_PADRAO)]);
      if (!ctx.ativo()) return;
      desenharLista();
    } catch (erro) {
      if (ctx.ativo()) mostrarFalha(raiz, erro, carregar);
    }
  }

  const nomeDoPlano = (id) => planos.find((p) => p.id === id)?.nome || id || 'Grátis';

  function desenharLista() {
    mostrar(raiz, html`
      ${topo}
      <div class="pilha">
        <div class="campo"><input class="campo__entrada" id="busca" type="search" placeholder="Buscar empresa ou e-mail" aria-label="Buscar" /></div>
        <div id="resultado" class="lista pilha pilha--pequena"></div>
      </div>`);
    const alvo = raiz.querySelector('#resultado');
    const filtrar = (termo) => {
      const t = textoParaBusca(termo);
      const achadas = t ? empresas.filter((e) => textoParaBusca(`${e.nome} ${e.emailAdmin} ${e.nomeAdmin}`).includes(t)) : empresas;
      mostrar(alvo, achadas.length === 0
        ? estadoVazio({ icone: 'clientes', titulo: 'Nenhuma conta encontrada' })
        : html`${achadas.map((e) => {
          const s = situacaoConta(e, regras);
          return itemLista({
            acao: 'abrir', dados: { id: e.id }, avatarNome: e.nome, titulo: e.nome,
            sub: `${e.emailAdmin || ''} · ${nomeDoPlano(e.planoId)}`, direita: html`${seloSituacao(s, rotuloSituacao(s))}${seta}`,
          });
        })}`);
    };
    filtrar('');
    raiz.querySelector('#busca').addEventListener('input', esperarDigitar((ev) => filtrar(ev.target.value)));
  }

  function desenharConta(e) {
    const s = situacaoConta(e, regras);
    mostrar(raiz, html`
      <header class="cabecalho"><button type="button" class="cabecalho__voltar" data-acao="lista" aria-label="Voltar">‹</button>
        <div class="cabecalho__textos"><h1 class="titulo-tela" tabindex="-1" id="titulo-da-tela">${e.nome}</h1><div class="cabecalho__sub">${e.emailAdmin || ''}</div></div>
        ${seloSituacao(s, rotuloSituacao(s))}</header>
      <div class="pilha">
        <div class="cartao">
          ${listaDeDados([
            ['Administrador', e.nomeAdmin],
            ['Plano', nomeDoPlano(e.planoId)],
            ['Pago até', e.planoAte ? formatarDataBR(e.planoAte) : ''],
            ['Teste até', formatarDataBR(fimDoTeste(e, regras))],
            ['Clientes', String(e.contadorClientes ?? 0)],
            ['Criada em', e.criadoEm ? formatarDataBR(e.criadoEm) : ''],
          ])}
        </div>
        ${botao({ texto: 'Ativar / renovar +30 dias', iconeNome: 'check', acao: 'renovar', bloco: true })}
        ${botao({ texto: 'Trocar plano', variante: 'secundario', acao: 'plano', bloco: true })}
        ${botao({ texto: 'Estender teste +7 dias', variante: 'secundario', acao: 'teste', bloco: true })}
        ${botao({ texto: e.bloqueada ? 'Desbloquear conta' : 'Bloquear conta', variante: e.bloqueada ? 'secundario' : 'perigo', iconeNome: 'cadeado', acao: 'bloquear', bloco: true })}
      </div>`);

    const salvar = async (el, campos, msg) => comCarregando(el, async () => {
      try {
        await atualizarContaDaEmpresa(e.id, campos);
        toast(msg, 'sucesso');
        await carregar();
      } catch (erro) { mostrarErro(erro); }
    });

    aoClicar(raiz, {
      lista: () => desenharLista(),
      renovar: (el) => salvar(el, { planoAte: novaValidade(e.planoAte, 30) }, 'Plano renovado por 30 dias.'),
      teste: (el) => salvar(el, { testeEstendidoAte: new Date(Math.max(Date.now(), (e.testeEstendidoAte?.getTime?.() ?? 0)) + 7 * 86400000) }, 'Teste estendido.'),
      plano: async (el) => {
        const id = await escolher({ titulo: 'Trocar plano', opcoes: planos.map((p) => ({ id: p.id, rotulo: p.nome })) });
        if (id) await salvar(el, { planoId: id }, 'Plano alterado.');
      },
      bloquear: async (el) => {
        if (!e.bloqueada && !await confirmar({ titulo: 'Bloquear esta conta?', mensagem: 'A empresa não conseguirá usar o app (só baixar o backup).', confirmar: 'Bloquear', perigo: true })) return;
        await salvar(el, { bloqueada: !e.bloqueada }, e.bloqueada ? 'Conta desbloqueada.' : 'Conta bloqueada.');
      },
    });
  }

  aoClicar(raiz, { abrir: (el) => { const e = empresas.find((x) => x.id === el.dataset.id); if (e) desenharConta(e); } });
  await carregar();
}
