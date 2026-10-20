// =============================================================================
// COMPONENTES — pedaços de HTML reutilizados em várias telas
// =============================================================================
// Cada função devolve html`...` (seguro). Mantê-los aqui garante telas iguais
// entre si e ajuda a cumprir a regra "sem redundância e sem complicação".
// =============================================================================

import { html, bruto, esc } from './ui-texto.js';
import { iniciais } from './ui-texto.js';
import { icone } from './icones.js';

export { iniciais };

/**
 * Cabeçalho da tela: botão voltar + título + subtítulo opcional.
 * voltarPara: '#/clientes' (link fixo) | true (volta no histórico) | omitido (sem botão).
 */
export function cabecalho({ titulo, subtitulo = '', voltarPara = null, acaoDireita = null }) {
  const voltar = voltarPara === true
    ? html`<button type="button" class="cabecalho__voltar" data-acao="voltar" aria-label="Voltar">${icone('voltar', 24)}</button>`
    : voltarPara
      ? html`<a class="cabecalho__voltar" href="${voltarPara}" aria-label="Voltar">${icone('voltar', 24)}</a>`
      : '';
  return html`
    <header class="cabecalho">
      ${voltar}
      <div class="cabecalho__textos">
        <h1 class="titulo-tela" tabindex="-1" id="titulo-da-tela">${titulo}</h1>
        ${subtitulo && html`<div class="cabecalho__sub">${subtitulo}</div>`}
      </div>
      ${acaoDireita}
    </header>`;
}

/** Menu de abas no topo. itens: [{ id, rotulo, href }]. */
export function menuSuperior(itens, ativo) {
  return html`${itens.map((i) => html`<a class="menu-topo__item ${i.id === ativo ? 'menu-topo__item--ativo' : ''}" href="${i.href}" ${i.id === ativo ? bruto('aria-current="page"') : ''}>${i.rotulo}</a>`)}`;
}

/** Campo de texto com rótulo, ajuda e (depois) erro. Usa data-campo para os erros de validação. */
export function campoTexto({
  nome, rotulo, valor = '', tipo = 'text', obrigatorio = false, opcional = false,
  placeholder = '', ajuda = '', modo = '', autocompletar = '', maximo = null, minimo = null,
  passo = null, desabilitado = false, id = null,
}) {
  const idCampo = id || `campo-${nome}`;
  return html`
    <div class="campo" data-campo="${nome}">
      <label class="campo__rotulo" for="${idCampo}">${rotulo}${opcional && html` <span class="campo__opcional">(opcional)</span>`}</label>
      <input class="campo__entrada" id="${idCampo}" name="${nome}" type="${tipo}" value="${valor ?? ''}"
        ${placeholder ? bruto(`placeholder="${esc(placeholder)}"`) : ''}
        ${modo ? bruto(`inputmode="${esc(modo)}"`) : ''}
        ${autocompletar ? bruto(`autocomplete="${esc(autocompletar)}"`) : ''}
        ${maximo !== null ? bruto(`maxlength="${esc(maximo)}"`) : ''}
        ${minimo !== null ? bruto(`min="${esc(minimo)}"`) : ''}
        ${passo !== null ? bruto(`step="${esc(passo)}"`) : ''}
        ${obrigatorio ? bruto('required') : ''}
        ${desabilitado ? bruto('disabled') : ''} />
      ${ajuda && html`<p class="campo__ajuda">${ajuda}</p>`}
    </div>`;
}

export function campoTextoLongo({ nome, rotulo, valor = '', opcional = false, placeholder = '', maximo = null, ajuda = '', linhas = 3 }) {
  return html`
    <div class="campo" data-campo="${nome}">
      <label class="campo__rotulo" for="campo-${nome}">${rotulo}${opcional && html` <span class="campo__opcional">(opcional)</span>`}</label>
      <textarea class="campo__entrada" id="campo-${nome}" name="${nome}" rows="${linhas}"
        ${placeholder ? bruto(`placeholder="${esc(placeholder)}"`) : ''}
        ${maximo !== null ? bruto(`maxlength="${esc(maximo)}"`) : ''}>${valor ?? ''}</textarea>
      ${ajuda && html`<p class="campo__ajuda">${ajuda}</p>`}
    </div>`;
}

/** Lista suspensa. opcoes: [{ valor, rotulo }]. */
export function campoSelecao({ nome, rotulo, opcoes, valor = '', vazio = '', opcional = false, ajuda = '' }) {
  return html`
    <div class="campo" data-campo="${nome}">
      <label class="campo__rotulo" for="campo-${nome}">${rotulo}${opcional && html` <span class="campo__opcional">(opcional)</span>`}</label>
      <select class="campo__entrada" id="campo-${nome}" name="${nome}">
        ${vazio && html`<option value="">${vazio}</option>`}
        ${opcoes.map((o) => html`<option value="${o.valor}" ${String(o.valor) === String(valor) ? bruto('selected') : ''}>${o.rotulo}</option>`)}
      </select>
      ${ajuda && html`<p class="campo__ajuda">${ajuda}</p>`}
    </div>`;
}

/** Escolha em "pílulas" (um só: radio; vários: checkbox). */
export function campoPilulas({ nome, rotulo, opcoes, valor = '', multiplo = false }) {
  const marcados = Array.isArray(valor) ? valor.map(String) : [String(valor)];
  return html`
    <div class="campo" data-campo="${nome}">
      <span class="campo__rotulo" id="rotulo-${nome}">${rotulo}</span>
      <div class="chips" role="${multiplo ? 'group' : 'radiogroup'}" aria-labelledby="rotulo-${nome}">
        ${opcoes.map((o) => html`
          <label class="chip">
            <input type="${multiplo ? 'checkbox' : 'radio'}" name="${nome}" value="${o.valor}" ${marcados.includes(String(o.valor)) ? bruto('checked') : ''} />
            <span class="chip__texto">${o.rotulo}</span>
          </label>`)}
      </div>
    </div>`;
}

/** Caixa de marcar com título e explicação. */
export function interruptor({ nome, titulo, descricao = '', marcado = false }) {
  return html`
    <label class="interruptor">
      <input type="checkbox" name="${nome}" ${marcado ? bruto('checked') : ''} />
      <span class="interruptor__texto">
        <span class="interruptor__titulo">${titulo}</span>
        ${descricao && html`<span class="campo__ajuda">${descricao}</span>`}
      </span>
    </label>`;
}

/**
 * Botão ou link com cara de botão.
 * variante: 'primario' (padrão) | 'secundario' | 'perigo' | 'perigo-cheio' | 'fantasma' | 'whatsapp'
 * Se tiver "href" vira <a>; se tiver "acao" ganha data-acao (ligado por aoClicar).
 */
export function botao({
  texto, tipo = 'button', variante = 'primario', acao = '', href = '', bloco = false,
  pequeno = false, iconeNome = '', desabilitado = false, id = '', dados = {}, externo = false,
}) {
  const classes = ['botao'];
  if (variante !== 'primario') classes.push(`botao--${variante}`);
  if (bloco) classes.push('botao--bloco');
  if (pequeno) classes.push('botao--pequeno');
  const atributosDados = Object.entries(dados)
    .map(([k, v]) => `data-${esc(k)}="${esc(v)}"`)
    .join(' ');
  const miolo = html`${iconeNome && icone(iconeNome, 20)}${texto}`;
  if (href) {
    return html`<a class="${classes.join(' ')}" href="${href}" ${acao ? bruto(`data-acao="${esc(acao)}"`) : ''} ${id ? bruto(`id="${esc(id)}"`) : ''} ${atributosDados ? bruto(atributosDados) : ''}
      ${externo ? bruto('target="_blank" rel="noopener noreferrer"') : ''}>${miolo}</a>`;
  }
  return html`<button class="${classes.join(' ')}" type="${tipo}" ${acao ? bruto(`data-acao="${esc(acao)}"`) : ''} ${id ? bruto(`id="${esc(id)}"`) : ''} ${atributosDados ? bruto(atributosDados) : ''}
    ${desabilitado ? bruto('disabled') : ''}>${miolo}</button>`;
}

/** Selo colorido. tom: 'azul' | 'verde' | 'amarelo' | 'vermelho' | '' (cinza). */
export function selo(texto, tom = '') {
  return html`<span class="selo ${tom ? `selo--${tom}` : ''}">${texto}</span>`;
}

/** Caixa de aviso. tom: '' (azul) | 'amarelo' | 'vermelho' | 'verde'. */
export function aviso({ texto, titulo = '', tom = '' }) {
  return html`<div class="aviso ${tom ? `aviso--${tom}` : ''}" ${tom === 'vermelho' ? bruto('role="alert"') : ''}>
    ${titulo && html`<div class="aviso__titulo">${titulo}</div>`}${texto}</div>`;
}

/** Tela/lista vazia com orientação do que fazer (nunca deixar o usuário perdido). */
export function estadoVazio({ icone: nomeIcone = 'info', titulo, texto = '', acao = null }) {
  return html`
    <div class="vazio">
      <div class="vazio__icone">${icone(nomeIcone, 28)}</div>
      <div class="vazio__titulo">${titulo}</div>
      ${texto && html`<p>${texto}</p>`}
      ${acao}
    </div>`;
}

/** Cartões "esqueleto" enquanto a tela carrega. */
export function esqueletos(quantidade = 3) {
  return html`<div class="pilha" aria-busy="true" aria-label="Carregando">
    ${Array.from({ length: quantidade }, () => html`<div class="esqueleto esqueleto--cartao"></div>`)}
  </div>`;
}

/** Círculo com as iniciais. */
export function avatar(nome, variante = '') {
  return html`<span class="avatar ${variante ? `avatar--${variante}` : ''}" aria-hidden="true">${iniciais(nome)}</span>`;
}

/** Linha de lista clicável (cliente, aparelho, funcionário...). */
export function itemLista({ href = '', avatarNome = '', avatarVariante = '', titulo, sub = '', direita = null, inativo = false, acao = '', dados = {} }) {
  const atributosDados = Object.entries(dados).map(([k, v]) => `data-${esc(k)}="${esc(v)}"`).join(' ');
  const conteudo = html`
    ${avatarNome && avatar(avatarNome, avatarVariante)}
    <div class="item-lista__textos">
      <div class="item-lista__titulo">${titulo}</div>
      ${sub && html`<div class="item-lista__sub">${sub}</div>`}
    </div>
    ${direita}`;
  const classe = `item-lista ${inativo ? 'item-lista--inativo' : ''}`;
  if (href) return html`<a class="${classe}" href="${href}" ${atributosDados ? bruto(atributosDados) : ''}>${conteudo}</a>`;
  return html`<div class="${classe}" ${acao ? bruto(`data-acao="${esc(acao)}"`) : ''} ${atributosDados ? bruto(atributosDados) : ''}>${conteudo}</div>`;
}

/** Lista "rótulo: valor". pares: [['Plano', 'Médio'], ...]. Pares com valor vazio são omitidos. */
export function listaDeDados(pares) {
  return html`<dl class="dados">
    ${pares.filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([r, v]) => html`<dt>${r}</dt><dd>${v}</dd>`)}
  </dl>`;
}

/** Abas (Vencidos / Próximos...). abas: [{ id, rotulo, contagem? }] */
export function abas(lista, ativa) {
  return html`<div class="abas" role="tablist">
    ${lista.map((a) => html`<button type="button" role="tab" class="aba ${a.id === ativa ? 'aba--ativa' : ''}" aria-selected="${a.id === ativa ? 'true' : 'false'}" data-acao="aba" data-aba="${a.id}">
      ${a.rotulo}${a.contagem !== undefined ? ` ${a.contagem}` : ''}</button>`)}
  </div>`;
}
