// =============================================================================
// TELA: Backup (exportar e importar os dados em JSON)
// =============================================================================
// Exportar: baixa um arquivo com clientes, aparelhos, serviços e valores.
// Importar: lê o arquivo, VALIDA, mostra o resumo e só grava depois da
// confirmação. A restauração não apaga nada: registros com o mesmo código são
// atualizados e os novos são criados (respeitando o limite de clientes).
// =============================================================================

import { html, mostrar, aoClicar, comCarregando, confirmar, baixarArquivo, toast } from '../nucleo/ui.js';
import { cabecalho, botao, aviso, listaDeDados } from '../nucleo/componentes.js';
import { empresaId } from '../nucleo/sessao.js';
import { gerarBackup, restaurarBackup } from '../servicos/backup.js';
import { nomeDoArquivoDeBackup, lerBackup } from '../dominio/backup.js';
import { formatarDataHoraBR } from '../dominio/datas.js';
import { traduzirErro } from '../nucleo/erros.js';

/** Nomes das seções do backup, em português, para os resumos. */
const ROTULOS = {
  tiposServico: 'Tipos de serviço', clientes: 'Clientes', aparelhos: 'Aparelhos', servicos: 'Serviços', valores: 'Valores',
};
const paraLista = (resumo) => Object.entries(ROTULOS).map(([chave, rotulo]) => [rotulo, String(resumo[chave] ?? 0)]);

const TAMANHO_MAXIMO = 20 * 1024 * 1024; // 20 MB: acima disso não é um backup nosso

export default async function montar({ raiz, sessao }) {
  mostrar(raiz, html`
    ${cabecalho({ titulo: 'Backup', subtitulo: 'Uma cópia dos seus dados, só sua', voltarPara: '#/administrativa' })}
    <div class="pilha">
      <section class="cartao pilha pilha--pequena">
        <h2>Salvar uma cópia</h2>
        <p class="texto-suave">Baixa um arquivo com clientes, aparelhos, serviços e valores. Guarde em lugar seguro: ele contém dados dos seus clientes.</p>
        ${botao({ texto: 'Baixar backup', acao: 'exportar', iconeNome: 'baixar', bloco: true })}
        <div id="resultado-exportar" aria-live="polite"></div>
      </section>

      <section class="cartao pilha pilha--pequena">
        <h2>Restaurar de um arquivo</h2>
        <p class="texto-suave">Escolha um backup do Meu Técnico. Nada é apagado: o que já existe é mantido ou atualizado.</p>
        <input type="file" id="arquivo-backup" class="campo__entrada" accept=".json,application/json" aria-label="Arquivo de backup" />
        <div id="area-importar" class="pilha pilha--pequena" aria-live="polite"></div>
      </section>
    </div>`);

  const resultadoExportar = raiz.querySelector('#resultado-exportar');
  const areaImportar = raiz.querySelector('#area-importar');
  const campoArquivo = raiz.querySelector('#arquivo-backup');
  let lido = null; // resultado validado de lerBackup, aguardando confirmação

  // ---- Importar: escolher o arquivo ----
  campoArquivo.addEventListener('change', async () => {
    lido = null;
    mostrar(areaImportar, html``);
    const arquivo = campoArquivo.files?.[0];
    if (!arquivo) return;
    if (arquivo.size > TAMANHO_MAXIMO) {
      mostrar(areaImportar, aviso({ tom: 'vermelho', texto: 'O arquivo é grande demais para ser um backup do Meu Técnico.' }));
      return;
    }
    let texto;
    try {
      texto = await arquivo.text();
    } catch {
      mostrar(areaImportar, aviso({ tom: 'vermelho', texto: 'Não foi possível ler o arquivo. Tente escolher de novo.' }));
      return;
    }
    const r = lerBackup(texto);
    if (!r.ok) {
      mostrar(areaImportar, aviso({ tom: 'vermelho', titulo: 'Arquivo recusado', texto: r.erro }));
      return;
    }
    lido = r;
    const quando = r.backup.exportadoEm instanceof Date ? formatarDataHoraBR(r.backup.exportadoEm) : '';
    mostrar(areaImportar, html`
      ${aviso({ tom: 'verde', titulo: 'Arquivo válido', texto: quando ? `Backup feito em ${quando}.` : '' })}
      ${listaDeDados(paraLista(r.resumo))}
      ${botao({ texto: 'Restaurar estes dados', acao: 'restaurar', bloco: true, iconeNome: 'subir' })}
      <p id="andamento" class="texto-suave centralizado" role="status"></p>`);
  });

  aoClicar(raiz, {
    // ---- Exportar ----
    exportar: (el) => comCarregando(el, async () => {
      const { texto, resumo } = await gerarBackup(empresaId(), sessao.empresa);
      baixarArquivo(nomeDoArquivoDeBackup(), texto);
      toast('Backup baixado.', 'sucesso');
      mostrar(resultadoExportar, html`${aviso({ tom: 'verde', titulo: 'Backup gerado', texto: 'O arquivo foi baixado neste aparelho.' })}${listaDeDados(paraLista(resumo))}`);
    }),

    // ---- Importar: confirmar e gravar ----
    restaurar: async (el) => {
      if (!lido) return;
      const sim = await confirmar({
        titulo: 'Restaurar este backup?',
        mensagem: 'Clientes, aparelhos e serviços do arquivo serão gravados na sua conta. Registros iguais serão atualizados. Nada será apagado.',
        confirmar: 'Restaurar',
      });
      if (!sim) return;
      const andamento = raiz.querySelector('#andamento');
      await comCarregando(el, async () => {
        try {
          const r = await restaurarBackup(empresaId(), sessao.usuario.uid, lido.backup, (t) => { if (andamento) andamento.textContent = t; });
          const linhas = [
            ['Tipos de serviço', String(r.tipos)], ['Clientes', String(r.clientes)], ['Aparelhos', String(r.aparelhos)],
            ['Serviços', String(r.servicos)], ['Valores', String(r.valores)],
          ];
          if (r.ignoradosPorLimite) linhas.push(['Clientes fora do limite do plano', String(r.ignoradosPorLimite)]);
          if (r.falhas) linhas.push(['Registros com falha', String(r.falhas)]);
          lido = null;
          campoArquivo.value = '';
          mostrar(areaImportar, html`
            ${aviso({
              tom: r.falhas || r.ignoradosPorLimite ? 'amarelo' : 'verde',
              titulo: 'Restauração concluída',
              texto: r.ignoradosPorLimite ? 'Alguns clientes não couberam no limite do seu plano.' : '',
            })}
            ${listaDeDados(linhas)}`);
          toast('Backup restaurado.', 'sucesso');
        } catch (erro) {
          if (andamento) andamento.textContent = '';
          mostrar(areaImportar, aviso({ tom: 'vermelho', titulo: 'Não foi possível restaurar', texto: traduzirErro(erro) }));
        }
      });
    },
  });
}
