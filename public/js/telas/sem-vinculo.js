// =============================================================================
// TELA: Concluir cadastro (login existe, mas não está ligado a nenhuma empresa)
// =============================================================================
// Acontece quando: a internet caiu no meio do cadastro; o administrador removeu
// o funcionário; ou a empresa foi excluída. Em vez de travar, damos 3 saídas:
//   1. criar a própria empresa;  2. usar um convite;  3. sair.
// =============================================================================

import { html, mostrar, aoEnviar, aoClicar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast } from '../nucleo/ui.js';
import { campoTexto, botao, aviso } from '../nucleo/componentes.js';
import { usuarioAtual } from '../nucleo/autenticacao.js';
import { comSessaoPausada, sairDaSessao } from '../nucleo/sessao.js';
import { concluirCadastroDaEmpresa } from '../servicos/empresas.js';
import { traduzirErro } from '../nucleo/erros.js';
import { validarFuncionario } from '../dominio/validacoes.js';

/** Aceita o link inteiro (https://.../#/convite/ABC/XYZ) ou só "ABC/XYZ". */
export function extrairConvite(texto) {
  const m = /convite\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/.exec(String(texto || ''));
  return m ? { empresaId: m[1], equipeId: m[2] } : null;
}

export default async function montar({ raiz, ir, sessao }) {
  const email = usuarioAtual()?.email || '';
  mostrar(raiz, html`
    <div class="tela-entrada">
      <div>
        <h1 class="titulo-tela" id="titulo-da-tela" tabindex="-1">Falta concluir o cadastro</h1>
        <p class="texto-suave">Você entrou como <strong>${email}</strong>, mas esta conta ainda não está ligada a nenhuma empresa.</p>
      </div>

      <form id="form-empresa" class="cartao formulario" novalidate>
        <h2>Sou dono da empresa</h2>
        <div data-erros-gerais></div>
        ${campoTexto({ nome: 'nome', rotulo: 'Seu nome', autocompletar: 'name', maximo: 100 })}
        ${campoTexto({ nome: 'nomeEmpresa', rotulo: 'Nome da empresa', opcional: true, maximo: 100 })}
        ${botao({ texto: 'Criar minha empresa', tipo: 'submit', bloco: true })}
      </form>

      <form id="form-convite" class="cartao formulario" novalidate>
        <h2>Recebi um convite</h2>
        <p class="texto-suave texto-pequeno">Cole aqui o link que o administrador enviou pelo WhatsApp.</p>
        ${campoTexto({ nome: 'link', rotulo: 'Link do convite' })}
        ${botao({ texto: 'Abrir convite', tipo: 'submit', variante: 'secundario', bloco: true })}
      </form>

      ${botao({ texto: 'Sair', variante: 'fantasma', bloco: true, acao: 'sair', iconeNome: 'sair' })}
    </div>`);

  aoClicar(raiz, {
    sair: (el) => comCarregando(el, () => sairDaSessao()),
  });

  const formEmpresa = raiz.querySelector('#form-empresa');
  aoEnviar(formEmpresa, async () => {
    limparErrosGerais(formEmpresa);
    const campos = lerCampos(formEmpresa);
    const nome = String(campos.nome || '').trim();
    if (nome.length < 2) {
      mostrarErrosNosCampos(formEmpresa, { nome: 'Digite o seu nome.' });
      return;
    }
    await comCarregando(formEmpresa.querySelector('[type="submit"]'), async () => {
      try {
        await comSessaoPausada(() => concluirCadastroDaEmpresa({
          uid: sessao.usuario.uid, email: sessao.usuario.email, nome, nomeEmpresa: String(campos.nomeEmpresa || '').trim() || nome,
        }));
      } catch (erro) {
        mostrarErrosNosCampos(formEmpresa, { geral: traduzirErro(erro) });
      }
    });
  });

  const formConvite = raiz.querySelector('#form-convite');
  aoEnviar(formConvite, () => {
    const convite = extrairConvite(lerCampos(formConvite).link);
    if (!convite) {
      mostrarErrosNosCampos(formConvite, { link: 'Esse link não parece um convite. Cole o link inteiro que você recebeu.' });
      return;
    }
    ir(`/convite/${convite.empresaId}/${convite.equipeId}`);
  });
}
