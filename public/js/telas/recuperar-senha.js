// =============================================================================
// TELA: Esqueci a senha (o Firebase manda um e-mail com o link para criar outra)
// =============================================================================

import { html, mostrar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando } from '../nucleo/ui.js';
import { cabecalho, campoTexto, botao, aviso } from '../nucleo/componentes.js';
import { redefinirSenha } from '../nucleo/autenticacao.js';
import { traduzirErro } from '../nucleo/erros.js';
import { validarEmail } from '../dominio/validacoes.js';

export default async function montar({ raiz }) {
  mostrar(raiz, html`
    ${cabecalho({ titulo: 'Recuperar senha', voltarPara: '#/entrar' })}
    <form id="form-recuperar" class="formulario" novalidate>
      <p class="texto-suave">Digite o e-mail da sua conta. Vamos enviar um link para você criar uma senha nova.</p>
      <div data-erros-gerais></div>
      ${campoTexto({ nome: 'email', rotulo: 'E-mail', tipo: 'email', modo: 'email', autocompletar: 'email' })}
      ${botao({ texto: 'Enviar link', tipo: 'submit', bloco: true })}
    </form>
    <div id="resultado"></div>`);

  const form = raiz.querySelector('#form-recuperar');
  aoEnviar(form, async () => {
    limparErrosGerais(form);
    const { erro, email } = validarEmail(lerCampos(form).email);
    if (erro) {
      mostrarErrosNosCampos(form, { email: erro });
      return;
    }
    await comCarregando(form.querySelector('[type="submit"]'), async () => {
      try {
        await redefinirSenha(email);
        // Por segurança a mensagem é a mesma exista ou não a conta (não revela quem tem cadastro).
        mostrar(raiz.querySelector('#resultado'), aviso({
          tom: 'verde', titulo: 'Pronto!',
          texto: 'Se existir uma conta com esse e-mail, o link já foi enviado. Confira também a caixa de spam.',
        }));
      } catch (e) {
        mostrarErrosNosCampos(form, { geral: traduzirErro(e) });
      }
    });
  });
}
