// =============================================================================
// TELA: Administrativa (menu de linhas do administrador)
// =============================================================================
// Reúne tudo que não é o dia a dia: equipe, tipos de serviço, configurações,
// plano, backup, conta e documentos legais. Só texto curto e linhas grandes.
// =============================================================================

import { html, mostrar } from '../nucleo/ui.js';
import { cabecalho, itemLista } from '../nucleo/componentes.js';
import { resumoDoPlano } from '../nucleo/sessao.js';
import { rotuloSituacao } from '../dominio/planos.js';
import { seta } from './_auxiliar-admin.js';

export default async function montar({ raiz, sessao }) {
  const resumo = resumoDoPlano();
  const textoPlano = resumo ? `${resumo.plano.nome} · ${rotuloSituacao(resumo.situacao)}` : '';

  // Cada linha: título, explicação curta e para onde vai.
  const linhas = [
    { titulo: 'Equipe', sub: 'Funcionários e convites', href: '#/equipe' },
    { titulo: 'Tipos de serviço', sub: 'Limpeza, instalação, retorno...', href: '#/tipos-servico' },
    { titulo: 'Configurações', sub: 'Empresa, aviso de retorno e mensagem', href: '#/configuracoes' },
    { titulo: 'Meu plano', sub: textoPlano || 'Plano, limite e pagamento', href: '#/plano' },
    { titulo: 'Backup', sub: 'Salvar ou restaurar seus dados', href: '#/backup' },
    { titulo: 'Minha conta', sub: 'Login, senha e exclusão da conta', href: '#/conta' },
    { titulo: 'Termos de uso', sub: '', href: '#/termos' },
    { titulo: 'Política de privacidade', sub: '', href: '#/privacidade' },
  ];

  mostrar(raiz, html`
    ${cabecalho({ titulo: 'Administrativa', subtitulo: sessao.empresa?.nome || '' })}
    <div class="lista pilha pilha--pequena">
      ${linhas.map((l) => itemLista({ href: l.href, titulo: l.titulo, sub: l.sub, direita: seta }))}
    </div>`);
}
