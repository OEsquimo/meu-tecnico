// =============================================================================
// TELA: Entrar (login por e-mail e senha)
// =============================================================================
// Exemplo do padrão usado em todas as telas de formulário:
//   1. desenha o HTML com html`...` (tudo que é interpolado é escapado);
//   2. valida com as funções de dominio/validacoes.js (mensagens por campo);
//   3. envia usando comCarregando() (desliga o botão = sem toque duplo);
//   4. erros viram texto claro em português (traduzirErro).
// =============================================================================

import { html, mostrar, aoEnviar, aoClicar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando } from '../nucleo/ui.js';
import { campoTexto, botao } from '../nucleo/componentes.js';
import { entrar } from '../nucleo/autenticacao.js';
import { traduzirErro } from '../nucleo/erros.js';
import { validarLogin } from '../dominio/validacoes.js';
import { NOME_APP } from '../nucleo/constantes.js';

export default async function montar({ raiz }) {
  const demonstracao = document.body.classList.contains('modo-demonstracao');
  mostrar(raiz, html`
    <div class="tela-entrada">
      <div>
        <div class="tela-entrada__marca">${NOME_APP}</div>
        <p class="tela-entrada__lema">Clientes, serviços e lembretes de retorno para técnicos de ar-condicionado.</p>
      </div>

      <form id="form-entrar" class="formulario" novalidate>
        <div data-erros-gerais></div>
        ${campoTexto({ nome: 'email', rotulo: 'E-mail', tipo: 'email', modo: 'email', autocompletar: 'email' })}
        ${campoTexto({ nome: 'senha', rotulo: 'Senha', tipo: 'password', autocompletar: 'current-password' })}
        ${botao({ texto: 'Entrar', tipo: 'submit', bloco: true })}
        <a class="botao botao--fantasma botao--bloco" href="#/recuperar-senha">Esqueci a senha</a>
      </form>

      <div class="cartao pilha pilha--pequena">
        <h2>Ainda não tem conta?</h2>
        <p class="texto-suave">Crie a sua em um minuto e comece com o plano grátis.</p>
        ${botao({ texto: 'Criar conta', variante: 'secundario', bloco: true, href: '#/criar-conta' })}
      </div>

      ${demonstracao && html`
        <div class="cartao demo-contas">
          <h2>Modo demonstração</h2>
          <p class="texto-suave texto-pequeno">Toque para preencher uma conta de exemplo (senha demo123).</p>
          ${botao({ texto: 'Administrador (dono da empresa)', variante: 'secundario', acao: 'demo', dados: { email: 'demo@meutecnico.app' } })}
          ${botao({ texto: 'Técnico (funcionário)', variante: 'secundario', acao: 'demo', dados: { email: 'tecnico@meutecnico.app' } })}
          ${botao({ texto: 'Dono do aplicativo', variante: 'secundario', acao: 'demo', dados: { email: 'dono@meutecnico.app' } })}
        </div>`}
    </div>`);

  const form = raiz.querySelector('#form-entrar');
  aoClicar(raiz, {
    demo: (el) => {
      form.elements.email.value = el.dataset.email;
      form.elements.senha.value = 'demo123';
      form.elements.senha.focus();
    },
  });

  aoEnviar(form, async () => {
    limparErrosGerais(form);
    const r = validarLogin(lerCampos(form));
    if (!r.valido) {
      mostrarErrosNosCampos(form, r.erros);
      return;
    }
    await comCarregando(form.querySelector('[type="submit"]'), async () => {
      try {
        await entrar(r.dados.email, r.dados.senha);
        // O roteador leva para a tela inicial quando a sessão terminar de carregar.
      } catch (erro) {
        mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
      }
    });
  });
}
