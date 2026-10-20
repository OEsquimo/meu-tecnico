// =============================================================================
// TELA: Minha conta (administrador e técnico)
// =============================================================================
// Mostra o login, permite sair, trocar a senha (por e-mail) e — só o
// administrador — EXCLUIR A CONTA com todos os dados (direito LGPD).
// A exclusão exige a senha e a digitação de "EXCLUIR".
// =============================================================================

import { html, mostrar, aoClicar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast, confirmar } from '../nucleo/ui.js';
import { cabecalho, botao, campoTexto, listaDeDados, aviso } from '../nucleo/componentes.js';
import { usuarioAtual, redefinirSenha } from '../nucleo/autenticacao.js';
import { sairDaSessao, empresaId } from '../nucleo/sessao.js';
import { excluirContaCompleta } from '../servicos/empresas.js';
import { ehAdminMesmoBloqueado } from '../nucleo/permissoes.js';
import { traduzirErro } from '../nucleo/erros.js';

export default async function montar({ raiz, sessao, ir }) {
  const admin = ehAdminMesmoBloqueado(sessao);
  const email = usuarioAtual()?.email || sessao.usuario?.email || '';

  mostrar(raiz, html`
    ${cabecalho({ titulo: 'Minha conta', voltarPara: admin ? '#/administrativa' : '#/' })}
    <div class="pilha">
      <div class="cartao">
        ${listaDeDados([
          ['Nome', sessao.vinculo?.nome],
          ['E-mail', email],
          ['Papel', admin ? 'Administrador' : 'Técnico'],
          ['Empresa', sessao.empresa?.nome],
        ])}
      </div>
      ${botao({ texto: 'Trocar senha (enviar e-mail)', variante: 'secundario', iconeNome: 'cadeado', acao: 'senha', bloco: true })}
      ${botao({ texto: 'Sair', variante: 'secundario', iconeNome: 'sair', acao: 'sair', bloco: true })}
      <p class="texto-suave texto-pequeno"><a href="#/termos">Termos de uso</a> · <a href="#/privacidade">Política de privacidade</a></p>

      ${admin ? html`
        <form id="form-excluir" class="cartao formulario" novalidate>
          <h2>Excluir minha conta</h2>
          ${aviso({ tom: 'vermelho', texto: 'Apaga a empresa, clientes, aparelhos, serviços, equipe e o seu login. Não dá para desfazer. Faça um backup antes.' })}
          <div data-erros-gerais></div>
          ${botao({ texto: 'Fazer backup agora', variante: 'secundario', href: '#/backup', iconeNome: 'baixar', bloco: true })}
          ${campoTexto({ nome: 'senha', rotulo: 'Sua senha', tipo: 'password', autocompletar: 'current-password' })}
          ${campoTexto({ nome: 'confirmacao', rotulo: 'Digite EXCLUIR para confirmar', autocompletar: 'off' })}
          <p class="texto-suave" id="progresso-exclusao" aria-live="polite"></p>
          ${botao({ texto: 'Excluir minha conta para sempre', tipo: 'submit', variante: 'perigo-cheio', bloco: true })}
        </form>` : ''}
    </div>`);

  aoClicar(raiz, {
    sair: (el) => comCarregando(el, () => sairDaSessao()),
    senha: (el) => comCarregando(el, async () => {
      try {
        await redefinirSenha(email);
        toast('Enviamos um e-mail para você criar a nova senha.', 'sucesso', 7000);
      } catch (e) { toast(traduzirErro(e), 'erro'); }
    }),
  });

  const form = raiz.querySelector('#form-excluir');
  if (form) {
    aoEnviar(form, async () => {
      limparErrosGerais(form);
      const c = lerCampos(form);
      const erros = {};
      if (!c.senha) erros.senha = 'Digite a sua senha.';
      if (String(c.confirmacao || '').trim().toUpperCase() !== 'EXCLUIR') erros.confirmacao = 'Digite a palavra EXCLUIR.';
      if (Object.keys(erros).length) { mostrarErrosNosCampos(form, erros); return; }
      if (!await confirmar({ titulo: 'Última confirmação', mensagem: 'Tudo será apagado agora.', confirmar: 'Apagar tudo', perigo: true })) return;
      const progresso = raiz.querySelector('#progresso-exclusao');
      await comCarregando(form.querySelector('[type="submit"]'), async () => {
        try {
          await excluirContaCompleta(empresaId(), c.senha, (t) => { progresso.textContent = t; });
          ir('/entrar');
        } catch (erro) {
          progresso.textContent = '';
          mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
        }
      });
    });
  }
}
