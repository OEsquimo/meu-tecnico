// =============================================================================
// ADAPTADOR DO FIRESTORE — o banco de dados de verdade
// =============================================================================
// Traduz as operações simples de "banco.js" para o SDK do Firebase:
//   * Date  <-> Timestamp (conversão automática nos dois sentidos);
//   * AGORA -> serverTimestamp();
//   * campos "undefined" são removidos (o Firestore recusa undefined).
// Recebe o SDK já carregado (ver firebase.js) para ser fácil de testar.
// =============================================================================

import { ehAgora, ehObjetoSimples } from './banco-comum.js';

export function criarAdaptadorFirestore(db, f) {
  /** App -> Firestore */
  function paraBanco(valor) {
    if (valor === undefined) return undefined;
    if (ehAgora(valor)) return f.serverTimestamp();
    if (valor instanceof Date) return f.Timestamp.fromDate(valor);
    if (Array.isArray(valor)) return valor.map((x) => {
      const convertido = paraBanco(x);
      return convertido === undefined ? null : convertido;
    });
    if (ehObjetoSimples(valor)) {
      const saida = {};
      for (const [chave, v] of Object.entries(valor)) {
        const convertido = paraBanco(v);
        if (convertido !== undefined) saida[chave] = convertido;
      }
      return saida;
    }
    return valor;
  }

  /** Firestore -> App (Timestamp vira Date) */
  function deBanco(valor) {
    if (valor && typeof valor.toDate === 'function') return valor.toDate();
    if (Array.isArray(valor)) return valor.map(deBanco);
    if (ehObjetoSimples(valor)) {
      const saida = {};
      for (const [chave, v] of Object.entries(valor)) saida[chave] = deBanco(v);
      return saida;
    }
    return valor;
  }

  return {
    nome: 'firestore',

    /** Gera um id novo para a coleção (sem gravar nada). */
    novoId(caminhoColecao) {
      return f.doc(f.collection(db, caminhoColecao)).id;
    },

    /** Lê um documento. Retorna { id, ...dados } ou null se não existir. */
    async ler(caminho) {
      const foto = await f.getDoc(f.doc(db, caminho));
      return foto.exists() ? { id: foto.id, ...deBanco(foto.data()) } : null;
    },

    /**
     * Lista documentos de uma coleção.
     * consulta = { onde: [[campo, operador, valor], ...], ordenarPor: [[campo, 'asc'|'desc']], limite }
     */
    async listar(caminhoColecao, consulta = {}) {
      const restricoes = [];
      for (const [campo, operador, valor] of consulta.onde || []) {
        restricoes.push(f.where(campo, operador, paraBanco(valor)));
      }
      for (const [campo, direcao] of consulta.ordenarPor || []) {
        restricoes.push(f.orderBy(campo, direcao || 'asc'));
      }
      if (consulta.limite) restricoes.push(f.limit(consulta.limite));
      const resultado = await f.getDocs(f.query(f.collection(db, caminhoColecao), ...restricoes));
      return resultado.docs.map((d) => ({ id: d.id, ...deBanco(d.data()) }));
    },

    /**
     * Grava várias operações de uma vez, TUDO OU NADA (lote/batch).
     * Cada operação: { tipo: 'criar'|'definir'|'mesclar'|'atualizar'|'apagar', caminho, dados }
     */
    async gravar(operacoes) {
      const lote = f.writeBatch(db);
      for (const op of operacoes) {
        const ref = f.doc(db, op.caminho);
        if (op.tipo === 'apagar') lote.delete(ref);
        else if (op.tipo === 'atualizar') lote.update(ref, paraBanco(op.dados));
        else if (op.tipo === 'mesclar') lote.set(ref, paraBanco(op.dados), { merge: true });
        else lote.set(ref, paraBanco(op.dados)); // 'criar' e 'definir'
      }
      await lote.commit();
    },
  };
}
