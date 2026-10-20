// =============================================================================
// ADAPTADOR EM MEMÓRIA — banco e login "de mentirinha"
// =============================================================================
// Usado em TESTES automáticos e no MODO DEMONSTRAÇÃO (abrir o app com ?demo=1).
// Imita o formato do adaptador do Firestore (nome, novoId, ler, listar, gravar)
// e o do login (observar, entrar, criar, sair...).
//
// ATENÇÃO: este adaptador NÃO aplica as regras de segurança (firestore.rules).
// Por isso testar com ele prova que as TELAS funcionam, mas NÃO prova que as
// regras estão certas (isso exige o emulador do Firebase — ver testes/).
// =============================================================================

import { AGORA, ehAgora, ehObjetoSimples, clonar, gerarId, segmentos, OPERADORES } from './banco-comum.js';

/** Cria um erro parecido com os do Firebase (tem .code) para testar o tratamento de erros. */
function erroComCodigo(codigo, mensagem) {
  const e = new Error(mensagem || codigo);
  e.code = codigo;
  return e;
}

/** Compara dois valores (Date, texto, número, booleano). Retorna -1, 0 ou 1. */
function comparar(a, b) {
  const va = a instanceof Date ? a.getTime() : a;
  const vb = b instanceof Date ? b.getTime() : b;
  if (va === vb) return 0;
  return va < vb ? -1 : 1;
}

function atendeFiltro(valorDoc, operador, valorFiltro) {
  if (valorDoc === undefined) return false; // o Firestore ignora docs sem o campo
  switch (operador) {
    case '==': return comparar(valorDoc, valorFiltro) === 0;
    case '!=': return comparar(valorDoc, valorFiltro) !== 0;
    case '<': return comparar(valorDoc, valorFiltro) < 0;
    case '<=': return comparar(valorDoc, valorFiltro) <= 0;
    case '>': return comparar(valorDoc, valorFiltro) > 0;
    case '>=': return comparar(valorDoc, valorFiltro) >= 0;
    case 'in': return Array.isArray(valorFiltro) && valorFiltro.some((v) => comparar(valorDoc, v) === 0);
    case 'array-contains': return Array.isArray(valorDoc) && valorDoc.some((v) => comparar(v, valorFiltro) === 0);
    default: throw new Error(`Operador desconhecido: ${operador}`);
  }
}

/** Troca AGORA pela data atual e copia tudo. */
function resolverValores(valor, agora) {
  if (ehAgora(valor)) return new Date(agora.getTime());
  if (valor instanceof Date) return new Date(valor.getTime());
  if (Array.isArray(valor)) return valor.map((x) => resolverValores(x, agora));
  if (ehObjetoSimples(valor)) {
    const saida = {};
    for (const [k, v] of Object.entries(valor)) {
      if (v !== undefined) saida[k] = resolverValores(v, agora);
    }
    return saida;
  }
  return valor;
}

export function criarAdaptadorMemoria({ chaveArmazenamento = null } = {}) {
  /** Todos os documentos: caminho completo -> dados. */
  const docs = new Map();

  // ---- Persistência opcional (modo demonstração guarda no navegador) ----
  function carregar() {
    if (!chaveArmazenamento || typeof localStorage === 'undefined') return;
    try {
      const bruto = localStorage.getItem(chaveArmazenamento);
      if (!bruto) return;
      const reviver = (v) => {
        if (Array.isArray(v)) return v.map(reviver);
        if (ehObjetoSimples(v)) {
          if (Object.keys(v).length === 1 && typeof v.$data === 'string') return new Date(v.$data);
          const o = {};
          for (const [k, x] of Object.entries(v)) o[k] = reviver(x);
          return o;
        }
        return v;
      };
      for (const [caminho, dados] of JSON.parse(bruto)) docs.set(caminho, reviver(dados));
    } catch { /* arquivo estragado: começa vazio */ }
  }

  // Date vira {"$data": "..."} ao salvar (JSON não tem tipo data)
  const originalStringify = JSON.stringify;
  function salvarComDatas() {
    if (!chaveArmazenamento || typeof localStorage === 'undefined') return;
    try {
      const trocar = (v) => {
        if (v instanceof Date) return { $data: v.toISOString() };
        if (Array.isArray(v)) return v.map(trocar);
        if (ehObjetoSimples(v)) {
          const o = {};
          for (const [k, x] of Object.entries(v)) o[k] = trocar(x);
          return o;
        }
        return v;
      };
      localStorage.setItem(chaveArmazenamento, originalStringify([...docs.entries()].map(([c, d]) => [c, trocar(d)])));
    } catch { /* ignora */ }
  }
  carregar();

  // ---------------------------------------------------------------------------
  // BANCO
  // ---------------------------------------------------------------------------
  const banco = {
    nome: 'memoria',

    novoId() {
      return gerarId(20);
    },

    async ler(caminho) {
      const dados = docs.get(caminho);
      if (!dados) return null;
      const partes = segmentos(caminho);
      return { id: partes[partes.length - 1], ...clonar(dados) };
    },

    async listar(caminhoColecao, consulta = {}) {
      const prefixo = `${segmentos(caminhoColecao).join('/')}/`;
      let lista = [];
      for (const [caminho, dados] of docs.entries()) {
        if (!caminho.startsWith(prefixo)) continue;
        const resto = caminho.slice(prefixo.length);
        if (resto.includes('/')) continue; // documento de subcoleção
        lista.push({ id: resto, ...clonar(dados) });
      }
      for (const [campo, operador, valor] of consulta.onde || []) {
        if (!OPERADORES.includes(operador)) throw new Error(`Operador desconhecido: ${operador}`);
        lista = lista.filter((d) => atendeFiltro(d[campo], operador, valor));
      }
      const ordem = consulta.ordenarPor || [];
      for (const [campo] of ordem) lista = lista.filter((d) => d[campo] !== undefined);
      if (ordem.length) {
        lista.sort((a, b) => {
          for (const [campo, direcao] of ordem) {
            const c = comparar(a[campo], b[campo]);
            if (c !== 0) return direcao === 'desc' ? -c : c;
          }
          return a.id < b.id ? -1 : 1;
        });
      }
      return consulta.limite ? lista.slice(0, consulta.limite) : lista;
    },

    async gravar(operacoes) {
      const agora = new Date();
      const copia = new Map(docs); // lote atômico: se algo falhar, nada muda
      for (const op of operacoes) {
        const existe = copia.has(op.caminho);
        if (op.tipo === 'apagar') {
          copia.delete(op.caminho);
        } else if (op.tipo === 'atualizar') {
          if (!existe) throw erroComCodigo('not-found', `Documento não existe: ${op.caminho}`);
          copia.set(op.caminho, { ...copia.get(op.caminho), ...resolverValores(op.dados, agora) });
        } else if (op.tipo === 'mesclar') {
          copia.set(op.caminho, { ...(copia.get(op.caminho) || {}), ...resolverValores(op.dados, agora) });
        } else {
          copia.set(op.caminho, resolverValores(op.dados, agora));
        }
      }
      docs.clear();
      for (const [c, d] of copia) docs.set(c, d);
      salvarComDatas();
    },
  };

  // ---------------------------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------------------------
  const usuarios = new Map(); // uid -> { uid, email, senha }
  let atual = null;
  const observadores = new Set();
  const avisar = () => {
    const foto = atual ? { uid: atual.uid, email: atual.email, nome: atual.nome || null } : null;
    for (const cb of observadores) cb(foto);
  };

  const validarEmail = (email) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) throw erroComCodigo('auth/invalid-email');
  };

  const auth = {
    nome: 'memoria',
    observar(cb) {
      observadores.add(cb);
      Promise.resolve().then(() => {
        if (observadores.has(cb)) cb(atual ? { uid: atual.uid, email: atual.email, nome: atual.nome || null } : null);
      });
      return () => observadores.delete(cb);
    },
    usuarioAtual() {
      return atual ? { uid: atual.uid, email: atual.email, nome: atual.nome || null } : null;
    },
    async entrar(email, senha) {
      validarEmail(email);
      const u = [...usuarios.values()].find((x) => x.email === email.toLowerCase());
      if (!u || u.senha !== senha) throw erroComCodigo('auth/invalid-credential');
      atual = u;
      avisar();
      return auth.usuarioAtual();
    },
    async criar(email, senha) {
      validarEmail(email);
      if (!senha || senha.length < 6) throw erroComCodigo('auth/weak-password');
      const minusculo = email.toLowerCase();
      if ([...usuarios.values()].some((x) => x.email === minusculo)) throw erroComCodigo('auth/email-already-in-use');
      const u = { uid: `u_${gerarId(12)}`, email: minusculo, senha };
      usuarios.set(u.uid, u);
      atual = u;
      avisar();
      return auth.usuarioAtual();
    },
    async sair() {
      atual = null;
      avisar();
    },
    async redefinirSenha(email) {
      validarEmail(email);
      // O Firebase não revela se o e-mail existe; aqui também não.
    },
    async reautenticar(senha) {
      if (!atual || atual.senha !== senha) throw erroComCodigo('auth/wrong-password');
    },
    async excluirUsuario() {
      if (!atual) throw erroComCodigo('auth/no-current-user');
      usuarios.delete(atual.uid);
      atual = null;
      avisar();
    },
  };

  return {
    banco,
    auth,
    /** Para testes: coloca documentos prontos no banco. semear({ 'empresas/x': {...} }) */
    semear(mapa) {
      const agora = new Date();
      for (const [caminho, dados] of Object.entries(mapa)) docs.set(caminho, resolverValores(dados, agora));
      salvarComDatas();
    },
    /** Para testes: cria um usuário de login sem entrar com ele. */
    cadastrarUsuario(email, senha, uid) {
      const u = { uid: uid || `u_${gerarId(12)}`, email: email.toLowerCase(), senha };
      usuarios.set(u.uid, u);
      return u.uid;
    },
    /** Para testes: todos os documentos (cópia). */
    todos() {
      return new Map([...docs.entries()].map(([c, d]) => [c, clonar(d)]));
    },
    limpar() {
      docs.clear();
      salvarComDatas();
    },
  };
}

export { AGORA };
