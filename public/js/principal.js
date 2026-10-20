// =============================================================================
// PRINCIPAL — o ponto de partida do aplicativo
// =============================================================================
// Ordem de abertura:
//   1. mostra a TELA DE ABERTURA com barra de progresso (o app nunca aparece
//      "vazio" antes dos dados do banco chegarem);
//   2. lê a configuração do Firebase (ou entra em modo demonstração);
//   3. liga o banco, o login e a sessão;
//   4. espera a sessão carregar (com tempo limite e botão "Tentar de novo");
//   5. esconde a abertura e liga o roteador (as telas).
// =============================================================================

import { carregarConfiguracao, iniciarFirebase } from './nucleo/firebase.js';
import { definirAdaptadorBanco } from './nucleo/banco.js';
import { definirAdaptadorAuth } from './nucleo/autenticacao.js';
import { iniciarSessao, aoMudarSessao, recarregarSessao, sessao } from './nucleo/sessao.js';
import { iniciarRoteador } from './nucleo/roteador.js';
import { traduzirErro } from './nucleo/erros.js';
import { toast } from './nucleo/ui.js';

const elAbertura = document.getElementById('abertura');
const elTexto = document.getElementById('abertura-texto');
const elTentar = document.getElementById('abertura-tentar');
const elApp = document.getElementById('app');
const TEMPO_LIMITE_ABERTURA_MS = 25000;

function textoAbertura(texto, { falha = false } = {}) {
  elTexto.textContent = texto;
  elTentar.hidden = !falha;
  elAbertura.querySelector('.abertura__trilho').hidden = falha;
}

/** Espera a sessão sair de "iniciando/carregando" (ou estourar o tempo). */
function esperarSessao() {
  return new Promise((resolver, rejeitar) => {
    const pronta = () => sessao.estado !== 'iniciando' && sessao.estado !== 'carregando';
    if (pronta()) {
      resolver();
      return;
    }
    const relogio = setTimeout(() => {
      parar();
      rejeitar(new Error('tempo-esgotado'));
    }, TEMPO_LIMITE_ABERTURA_MS);
    const parar = aoMudarSessao(() => {
      if (pronta()) {
        clearTimeout(relogio);
        parar();
        resolver();
      }
    });
  });
}

/** Mostra uma faixa quando o aparelho está sem internet. */
function monitorarConexao() {
  const faixa = document.createElement('div');
  faixa.className = 'faixa-aviso';
  faixa.setAttribute('role', 'status');
  faixa.textContent = 'Você está sem internet. Dá para consultar, mas não para salvar.';
  faixa.hidden = true;
  document.body.prepend(faixa);
  const atualizar = () => { faixa.hidden = navigator.onLine !== false; };
  window.addEventListener('online', () => { atualizar(); toast('Internet de volta.', 'sucesso'); });
  window.addEventListener('offline', atualizar);
  atualizar();
}

/** Registra o service worker (deixa o app abrir sem internet e instalar na tela inicial). */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (new URLSearchParams(location.search).get('semsw') === '1') return;
  navigator.serviceWorker.register('./service-worker.js').then((registro) => {
    registro.addEventListener('updatefound', () => {
      const novo = registro.installing;
      novo?.addEventListener('statechange', () => {
        if (novo.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Nova versão instalada. Ela será usada na próxima vez que você abrir o app.', 'sucesso', 8000);
        }
      });
    });
  }).catch(() => { /* sem service worker o app funciona do mesmo jeito, só não abre offline */ });
}

function mostrarNaoConfigurado() {
  elAbertura.querySelector('.abertura__trilho').hidden = true;
  elAbertura.innerHTML = `
    <div class="abertura__marca">Meu Técnico</div>
    <p class="abertura__texto"><strong>O aplicativo ainda não está configurado.</strong></p>
    <p class="abertura__texto">Falta criar o arquivo <code>public/js/configuracao/firebase-config.js</code>
    (copie de <code>firebase-config.exemplo.js</code> e cole os dados do seu projeto Firebase).
    O passo a passo está em <code>docs/GUIA-FIREBASE.md</code>.</p>
    <p class="abertura__texto">Para só ver o app funcionando com dados de exemplo, abra com <code>?demo=1</code> no endereço.</p>`;
}

async function ligarBancoELogin() {
  const parametros = new URLSearchParams(location.search);
  if (parametros.get('demo') === '1') {
    const { criarAdaptadorMemoria } = await import('./nucleo/adaptador-memoria.js');
    const { semearDemonstracao, cadastrarUsuariosDemo } = await import('./nucleo/demonstracao.js');
    const memoria = criarAdaptadorMemoria({ chaveArmazenamento: 'meu-tecnico-demo' });
    if (!memoria.todos().size) await semearDemonstracao(memoria);
    cadastrarUsuariosDemo(memoria); // o login de exemplo vive só na memória: registra a cada abertura
    definirAdaptadorBanco(memoria.banco);
    definirAdaptadorAuth(memoria.auth);
    document.body.classList.add('modo-demonstracao');
    return true;
  }
  const config = await carregarConfiguracao();
  if (!config) return false;
  const { banco, auth } = await iniciarFirebase(config);
  definirAdaptadorBanco(banco);
  definirAdaptadorAuth(auth);
  return true;
}

async function abrir() {
  textoAbertura('Carregando seus dados…');
  try {
    const configurado = await ligarBancoELogin();
    if (!configurado) {
      mostrarNaoConfigurado();
      return;
    }
    iniciarSessao();
    await esperarSessao();
    elAbertura.hidden = true;
    elApp.hidden = false;
    await iniciarRoteador({ raiz: document.getElementById('conteudo'), menu: document.getElementById('menu-topo') });
  } catch (erro) {
    console.error(erro);
    const demorou = erro && erro.message === 'tempo-esgotado';
    textoAbertura(
      demorou
        ? 'Está demorando mais que o normal. Confira a internet e tente de novo. Seus dados não foram perdidos.'
        : traduzirErro(erro),
      { falha: true },
    );
  }
}

elTentar.addEventListener('click', async () => {
  if (sessao.usuario) {
    textoAbertura('Carregando seus dados…');
    recarregarSessao();
    try {
      await esperarSessao();
      elAbertura.hidden = true;
      elApp.hidden = false;
      await iniciarRoteador({ raiz: document.getElementById('conteudo'), menu: document.getElementById('menu-topo') });
    } catch {
      textoAbertura('Ainda sem resposta. Confira a internet e tente de novo.', { falha: true });
    }
  } else {
    location.reload();
  }
});

registrarServiceWorker();
monitorarConexao();
abrir();
