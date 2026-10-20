// =============================================================================
// UI — ajudantes de tela (DOM): desenhar, avisos, janelas, formulários, botões
// =============================================================================
// Tudo que mexe na página (document) e é usado por várias telas fica aqui.
// =============================================================================

import { html, esc, bruto } from './ui-texto.js';
import { traduzirErro } from './erros.js';

export { html, esc, bruto };

// -----------------------------------------------------------------------------
// DESENHAR NA TELA
// -----------------------------------------------------------------------------

/**
 * Coloca o HTML dentro do elemento e aplica larguras/alturas dinâmicas
 * (data-altura / data-largura), já que o CSP não deixa usar style="".
 */
export function mostrar(elemento, conteudo) {
  elemento.innerHTML = String(conteudo);
  aplicarEstilosDinamicos(elemento);
}

/**
 * Elementos com data-altura="40" ou data-largura="75" recebem a variável CSS
 * --altura / --largura (0 a 100). Mexer por JavaScript (CSSOM) é permitido pelo CSP.
 */
export function aplicarEstilosDinamicos(raiz) {
  for (const el of raiz.querySelectorAll('[data-altura]')) {
    el.style.setProperty('--altura', String(Math.max(0, Math.min(100, Number(el.dataset.altura) || 0))));
  }
  for (const el of raiz.querySelectorAll('[data-largura]')) {
    el.style.setProperty('--largura', String(Math.max(0, Math.min(100, Number(el.dataset.largura) || 0))));
  }
}

/**
 * Liga cliques em elementos com data-acao="nome" aos manipuladores do mapa.
 *   aoClicar(raiz, { excluir: (el, ev) => ..., voltar: () => ... })
 * Usa delegação: funciona mesmo para elementos criados depois.
 */
export function aoClicar(raiz, mapa) {
  const ouvinte = (evento) => {
    const alvo = evento.target.closest('[data-acao]');
    if (!alvo || !raiz.contains(alvo)) return;
    const funcao = mapa[alvo.dataset.acao];
    if (!funcao) return;
    if (alvo.tagName === 'A' && !alvo.getAttribute('href')) evento.preventDefault();
    funcao(alvo, evento);
  };
  raiz.addEventListener('click', ouvinte);
  return () => raiz.removeEventListener('click', ouvinte);
}

/** Liga o envio de um formulário (Enter ou botão) ao manipulador. */
export function aoEnviar(formulario, manipulador) {
  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    manipulador(evento);
  });
}

// -----------------------------------------------------------------------------
// AVISOS RÁPIDOS (toast)
// -----------------------------------------------------------------------------

/** Mensagem curta que some sozinha. tipo: 'info' | 'sucesso' | 'erro' */
export function toast(mensagem, tipo = 'info', duracaoMs = 4500) {
  const area = document.getElementById('avisos-rapidos');
  if (!area) return;
  const item = document.createElement('div');
  item.className = `aviso-rapido${tipo === 'erro' ? ' aviso-rapido--erro' : tipo === 'sucesso' ? ' aviso-rapido--sucesso' : ''}`;
  item.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  item.textContent = mensagem;
  area.appendChild(item);
  setTimeout(() => item.remove(), duracaoMs);
}

/** Mostra a mensagem de um erro qualquer (já traduzida). */
export function mostrarErro(erro) {
  toast(traduzirErro(erro), 'erro', 6000);
}

// -----------------------------------------------------------------------------
// JANELAS (confirmar / escolher)
// -----------------------------------------------------------------------------

function criarJanela() {
  const janela = document.createElement('dialog');
  janela.className = 'janela';
  document.body.appendChild(janela);
  return janela;
}

/**
 * Pergunta "tem certeza?" e devolve true/false. Use antes de apagar qualquer coisa.
 * perigo=true deixa o botão de confirmar vermelho.
 */
export function confirmar({ titulo, mensagem = '', confirmar = 'Confirmar', cancelar = 'Cancelar', perigo = false }) {
  return new Promise((resolver) => {
    const janela = criarJanela();
    janela.setAttribute('aria-labelledby', 'janela-titulo');
    janela.innerHTML = String(html`
      <h2 id="janela-titulo">${titulo}</h2>
      ${mensagem && html`<p class="texto-suave">${mensagem}</p>`}
      <div class="janela__acoes">
        <button type="button" class="botao botao--bloco ${perigo ? 'botao--perigo-cheio' : ''}" data-resposta="sim">${confirmar}</button>
        <button type="button" class="botao botao--bloco botao--secundario" data-resposta="nao">${cancelar}</button>
      </div>`);
    let resposta = false;
    janela.addEventListener('click', (e) => {
      const botao = e.target.closest('[data-resposta]');
      if (botao) {
        resposta = botao.dataset.resposta === 'sim';
        janela.close();
      }
    });
    janela.addEventListener('close', () => {
      janela.remove();
      resolver(resposta);
    });
    janela.showModal();
  });
}

/**
 * Janela com várias opções (ex.: escolher Waze ou Google Maps).
 * opcoes: [{ id, rotulo, href?, icone? }]. Se a opção tem href, abre o link.
 * Retorna o id escolhido ou null se cancelou.
 */
export function escolher({ titulo, mensagem = '', opcoes, cancelar = 'Cancelar' }) {
  return new Promise((resolver) => {
    const janela = criarJanela();
    janela.setAttribute('aria-labelledby', 'janela-titulo');
    janela.innerHTML = String(html`
      <h2 id="janela-titulo">${titulo}</h2>
      ${mensagem && html`<p class="texto-suave">${mensagem}</p>`}
      <div class="janela__acoes">
        ${opcoes.map((o) => (o.href
          ? html`<a class="janela__opcao" href="${o.href}" target="_blank" rel="noopener noreferrer" data-escolha="${o.id}">${o.rotulo}</a>`
          : html`<button type="button" class="janela__opcao" data-escolha="${o.id}">${o.rotulo}</button>`))}
        <button type="button" class="botao botao--bloco botao--secundario" data-escolha="">${cancelar}</button>
      </div>`);
    let escolhido = null;
    janela.addEventListener('click', (e) => {
      const alvo = e.target.closest('[data-escolha]');
      if (alvo) {
        escolhido = alvo.dataset.escolha || null;
        janela.close();
      }
    });
    janela.addEventListener('close', () => {
      janela.remove();
      resolver(escolhido);
    });
    janela.showModal();
  });
}

// -----------------------------------------------------------------------------
// BOTÕES COM "CARREGANDO" (impede toque duplo = gravação duplicada)
// -----------------------------------------------------------------------------

/**
 * Executa "funcao" desligando o botão e mostrando o círculo girando.
 * Se der erro, mostra a mensagem e religa o botão. Retorna o resultado da função
 * (ou undefined se deu erro).
 */
export async function comCarregando(botao, funcao) {
  if (botao.dataset.ocupado === 'sim') return undefined;
  botao.dataset.ocupado = 'sim';
  botao.disabled = true;
  botao.setAttribute('aria-busy', 'true');
  botao.classList.add('botao--carregando');
  try {
    return await funcao();
  } catch (erro) {
    mostrarErro(erro);
    return undefined;
  } finally {
    // O botão pode já ter saído da tela (a tela mudou): só religa se ainda existe.
    if (botao.isConnected) {
      botao.dataset.ocupado = 'nao';
      botao.disabled = false;
      botao.removeAttribute('aria-busy');
      botao.classList.remove('botao--carregando');
    }
  }
}

// -----------------------------------------------------------------------------
// FORMULÁRIOS
// -----------------------------------------------------------------------------

/**
 * Lê todos os campos de um formulário: texto vira string (sem espaços nas
 * pontas), checkbox único vira true/false, radios viram o valor marcado.
 */
export function lerCampos(formulario) {
  const dados = {};
  for (const el of formulario.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      dados[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) dados[el.name] = el.value;
      else if (!(el.name in dados)) dados[el.name] = '';
    } else {
      dados[el.name] = typeof el.value === 'string' ? el.value.trim() : el.value;
    }
  }
  return dados;
}

/** Remove todas as mensagens de erro do formulário. */
export function limparErros(formulario) {
  for (const campo of formulario.querySelectorAll('.campo--erro')) campo.classList.remove('campo--erro');
  for (const msg of formulario.querySelectorAll('.campo__erro')) msg.remove();
  for (const el of formulario.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
}

/**
 * Mostra cada erro embaixo do seu campo e leva o foco ao primeiro.
 * erros = { nomeDoCampo: 'mensagem' }. Erros sem campo correspondente vão para
 * o aviso do topo do formulário ([data-erros-gerais]) ou para um toast.
 */
export function mostrarErrosNosCampos(formulario, erros) {
  limparErros(formulario);
  let primeiro = null;
  const semCampo = [];
  for (const [nome, mensagem] of Object.entries(erros)) {
    const campo = formulario.querySelector(`[data-campo="${nome}"]`);
    if (!campo) {
      semCampo.push(mensagem);
      continue;
    }
    campo.classList.add('campo--erro');
    const entrada = campo.querySelector('input, select, textarea');
    const idErro = `erro-${nome}`;
    const p = document.createElement('p');
    p.className = 'campo__erro';
    p.id = idErro;
    p.setAttribute('role', 'alert');
    p.textContent = mensagem;
    campo.appendChild(p);
    if (entrada) {
      entrada.setAttribute('aria-invalid', 'true');
      entrada.setAttribute('aria-describedby', idErro);
      if (!primeiro) primeiro = entrada;
    }
  }
  if (semCampo.length) {
    const area = formulario.querySelector('[data-erros-gerais]');
    if (area) {
      area.innerHTML = String(html`<div class="aviso aviso--vermelho" role="alert">${semCampo.join(' ')}</div>`);
    } else {
      toast(semCampo.join(' '), 'erro', 6000);
    }
  }
  if (primeiro) primeiro.focus();
}

/** Limpa o aviso geral do formulário (chamado antes de enviar de novo). */
export function limparErrosGerais(formulario) {
  const area = formulario.querySelector('[data-erros-gerais]');
  if (area) area.innerHTML = '';
}

// -----------------------------------------------------------------------------
// OUTROS AJUDANTES
// -----------------------------------------------------------------------------

/** Baixa um arquivo gerado no próprio aparelho (usado no backup JSON). */
export function baixarArquivo(nome, conteudo, tipo = 'application/json') {
  const blob = new Blob([conteudo], { type: `${tipo};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Copia um texto para a área de transferência. Retorna true se conseguiu. */
export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.className = 'somente-leitor';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Espera o usuário parar de digitar antes de executar (buscas). */
export function esperarDigitar(funcao, atrasoMs = 200) {
  let relogio;
  return (...args) => {
    clearTimeout(relogio);
    relogio = setTimeout(() => funcao(...args), atrasoMs);
  };
}
