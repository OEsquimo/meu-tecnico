// =============================================================================
// TELA: Meus dados (/equipe/eu) — só administrador
// =============================================================================
// O administrador edita o próprio nome e WhatsApp e escolhe se atende serviços.
// Desligado: ele deixa de aparecer na lista de técnicos ao agendar (serviços já agendados ficam como estão).
// =============================================================================

import { html, mostrar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast } from '../nucleo/ui.js';
import { cabecalho, campoTexto, interruptor, botao } from '../nucleo/componentes.js';
import { salvarDadosDoAdministrador } from '../servicos/equipe.js';
import { empresaId, recarregarSessao } from '../nucleo/sessao.js';
import { validarAdministrador } from '../dominio/validacoes.js';
import { formatarTelefone, mascararTelefoneDigitando } from '../dominio/telefone.js';
import { traduzirErro } from '../nucleo/erros.js';

export default async function montar({ raiz, sessao, ir }) {
  const vinculo = sessao.vinculo || {};
  const atende = sessao.empresa?.adminAtende !== false;
  mostrar(raiz, html`
    ${cabecalho({ titulo: 'Meus dados', subtitulo: 'Administrador', voltarPara: '#/equipe' })}
    <form id="form-admin" class="formulario" novalidate>
      <div data-erros-gerais></div>
      ${campoTexto({ nome: 'nome', rotulo: 'Nome', valor: vinculo.nome || '', maximo: 100, autocompletar: 'off' })}
      ${campoTexto({ nome: 'telefone', rotulo: 'WhatsApp', tipo: 'tel', modo: 'tel', placeholder: '(11) 91234-5678', valor: vinculo.telefone ? formatarTelefone(vinculo.telefone) : '', opcional: true })}
      ${interruptor({ nome: 'atende', titulo: 'Eu atendo serviços', descricao: 'Desligado, você não aparece como técnico ao agendar. Os serviços já agendados com você ficam como estão.', marcado: atende })}
      ${botao({ texto: 'Salvar', tipo: 'submit', bloco: true })}
    </form>`);

  const form = raiz.querySelector('#form-admin');
  form.elements.telefone.addEventListener('input', (e) => { e.target.value = mascararTelefoneDigitando(e.target.value); });

  aoEnviar(form, async () => {
    limparErrosGerais(form);
    const campos = lerCampos(form);
    const r = validarAdministrador(campos);
    if (!r.valido) { mostrarErrosNosCampos(form, r.erros); return; }
    await comCarregando(form.querySelector('[type="submit"]'), async () => {
      try {
        await salvarDadosDoAdministrador(empresaId(), sessao.usuario.uid, { ...r.dados, atende: campos.atende === true });
        await recarregarSessao(); // nome, WhatsApp e "atende" passam a valer em todas as telas
        toast('Dados salvos.', 'sucesso');
        ir('/equipe');
      } catch (erro) {
        mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
      }
    });
  });
}
