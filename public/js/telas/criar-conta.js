// =============================================================================
// TELA: Criar conta (cadastro de quem compra o app: técnico autônomo ou empresa)
// =============================================================================
// Cria o login e a empresa (com plano grátis e período de teste). Quem trabalha
// sozinho é o administrador e também faz os serviços; quem tem equipe convida
// os técnicos depois, em Administrativa > Equipe.
// =============================================================================

import { html, mostrar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando } from '../nucleo/ui.js';
import { cabecalho, campoTexto, botao } from '../nucleo/componentes.js';
import { cadastrarEmpresaEAdmin } from '../servicos/empresas.js';
import { traduzirErro } from '../nucleo/erros.js';
import { validarCriarConta } from '../dominio/validacoes.js';

export default async function montar({ raiz }) {
  mostrar(raiz, html`
    ${cabecalho({ titulo: 'Criar conta', subtitulo: 'Comece grátis, sem cartão', voltarPara: '#/entrar' })}
    <form id="form-conta" class="formulario" novalidate>
      <div data-erros-gerais></div>
      ${campoTexto({ nome: 'nome', rotulo: 'Seu nome', autocompletar: 'name', maximo: 100 })}
      ${campoTexto({
        nome: 'nomeEmpresa', rotulo: 'Nome da empresa', opcional: true, maximo: 100,
        ajuda: 'Se você trabalha sozinho, pode deixar em branco: usamos o seu nome.',
      })}
      ${campoTexto({ nome: 'email', rotulo: 'E-mail', tipo: 'email', modo: 'email', autocompletar: 'email' })}
      ${campoTexto({ nome: 'senha', rotulo: 'Senha', tipo: 'password', autocompletar: 'new-password', ajuda: 'Pelo menos 6 caracteres.' })}
      ${campoTexto({ nome: 'confirmarSenha', rotulo: 'Repita a senha', tipo: 'password', autocompletar: 'new-password' })}

      <div class="campo" data-campo="aceitouTermos">
        <label class="interruptor">
          <input type="checkbox" name="aceitouTermos" />
          <span class="interruptor__texto">
            <span>Li e aceito os <a href="#/termos">termos de uso</a> e a <a href="#/privacidade">política de privacidade</a>.</span>
          </span>
        </label>
      </div>

      ${botao({ texto: 'Criar minha conta', tipo: 'submit', bloco: true })}
    </form>`);

  const form = raiz.querySelector('#form-conta');
  aoEnviar(form, async () => {
    limparErrosGerais(form);
    const r = validarCriarConta(lerCampos(form));
    if (!r.valido) {
      mostrarErrosNosCampos(form, r.erros);
      return;
    }
    await comCarregando(form.querySelector('[type="submit"]'), async () => {
      try {
        await cadastrarEmpresaEAdmin(r.dados);
        // Pronto: o roteador abre a tela inicial quando a sessão terminar de carregar.
      } catch (erro) {
        mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
      }
    });
  });
}
