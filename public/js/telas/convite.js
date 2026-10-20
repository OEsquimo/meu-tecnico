// =============================================================================
// TELA: Convite para entrar na equipe (o técnico abre o link recebido por WhatsApp)
// =============================================================================
// Três situações:
//   * visitante  -> cria login novo OU entra com login que já tem, e aceita o convite;
//   * logado sem empresa -> só confirma o nome e aceita;
//   * já está em uma empresa -> avisa (um login pertence a uma empresa só).
// O convite é uma chave longa e aleatória; quem não tem o link não consegue usá-lo.
// =============================================================================

import { html, mostrar, aoEnviar, aoClicar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast } from '../nucleo/ui.js';
import { cabecalho, campoTexto, botao, aviso, abas, estadoVazio } from '../nucleo/componentes.js';
import { entrar, criarLogin, usuarioAtual } from '../nucleo/autenticacao.js';
import { comSessaoPausada } from '../nucleo/sessao.js';
import { aceitarConvite } from '../servicos/equipe.js';
import { traduzirErro } from '../nucleo/erros.js';
import { validarAceitarConvite } from '../dominio/validacoes.js';

export default async function montar({ raiz, params, sessao }) {
  const { empresaId, equipeId } = params;

  if (sessao.estado === 'pronto' || sessao.estado === 'conta-bloqueada') {
    mostrar(raiz, estadoVazio({
      icone: 'info',
      titulo: 'Você já está em uma empresa',
      texto: 'Cada login pertence a uma empresa só. Para aceitar este convite, saia e entre com outro e-mail.',
      acao: botao({ texto: 'Ir para o início', href: '#/' }),
    }));
    return;
  }

  const logado = sessao.estado === 'sem-vinculo';
  let modo = 'novo'; // 'novo' | 'tenho-conta' (só para visitante)

  function desenhar() {
    mostrar(raiz, html`
      ${cabecalho({ titulo: 'Convite para a equipe', subtitulo: 'Você foi convidado(a) para usar o Meu Técnico', voltarPara: logado ? '#/vinculo' : '#/entrar' })}
      <form id="form-convite" class="formulario" novalidate>
        <div data-erros-gerais></div>
        ${logado ? html`
          <p class="texto-suave">Você entrou como <strong>${usuarioAtual()?.email}</strong>. Confirme o seu nome para entrar na equipe.</p>
          ${campoTexto({ nome: 'nome', rotulo: 'Seu nome', autocompletar: 'name', maximo: 100 })}
        ` : html`
          ${abas([{ id: 'novo', rotulo: 'Sou novo no app' }, { id: 'tenho-conta', rotulo: 'Já tenho conta' }], modo)}
          ${modo === 'novo' ? campoTexto({ nome: 'nome', rotulo: 'Seu nome', autocompletar: 'name', maximo: 100 }) : ''}
          ${campoTexto({ nome: 'email', rotulo: 'E-mail', tipo: 'email', modo: 'email', autocompletar: 'email' })}
          ${campoTexto({ nome: 'senha', rotulo: modo === 'novo' ? 'Crie uma senha' : 'Senha', tipo: 'password', autocompletar: modo === 'novo' ? 'new-password' : 'current-password', ajuda: modo === 'novo' ? 'Pelo menos 6 caracteres.' : '' })}
          ${modo === 'novo' ? campoTexto({ nome: 'confirmarSenha', rotulo: 'Repita a senha', tipo: 'password', autocompletar: 'new-password' }) : ''}
          ${modo === 'novo' ? html`
            <div class="campo" data-campo="aceitouTermos">
              <label class="interruptor">
                <input type="checkbox" name="aceitouTermos" />
                <span class="interruptor__texto"><span>Li e aceito os <a href="#/termos">termos de uso</a> e a <a href="#/privacidade">política de privacidade</a>.</span></span>
              </label>
            </div>` : ''}
        `}
        ${botao({ texto: 'Entrar na equipe', tipo: 'submit', bloco: true })}
      </form>
      ${aviso({ texto: 'O administrador da empresa vê o seu nome e o seu telefone. Você só enxerga os serviços que ele atribuir a você, sem valores.' })}`);

    const form = raiz.querySelector('#form-convite');
    aoEnviar(form, () => enviar(form));
  }

  async function enviar(form) {
    limparErrosGerais(form);
    const campos = lerCampos(form);
    const r = logado
      ? { valido: !!campos.nome && campos.nome.length >= 2, erros: { nome: 'Digite o seu nome.' }, dados: { nome: campos.nome } }
      : validarAceitarConvite(campos, { jaTemConta: modo === 'tenho-conta' });
    if (!r.valido) {
      mostrarErrosNosCampos(form, r.erros);
      return;
    }
    await comCarregando(form.querySelector('[type="submit"]'), async () => {
      try {
        // Pausa o carregamento da sessão: o login nasce antes do vínculo com a empresa.
        await comSessaoPausada(async () => {
          let uid;
          if (logado) {
            uid = usuarioAtual().uid;
          } else if (modo === 'novo') {
            uid = (await criarLogin(r.dados.email, r.dados.senha)).uid;
          } else {
            uid = (await entrar(r.dados.email, r.dados.senha)).uid;
          }
          await aceitarConvite({ empresaId, equipeId, nome: r.dados.nome || undefined, uid });
        });
      } catch (erro) {
        toast(traduzirErro(erro), 'erro', 7000);
      }
    });
  }

  aoClicar(raiz, {
    aba: (el) => {
      modo = el.dataset.aba;
      desenhar();
    },
  });
  desenhar();
}
