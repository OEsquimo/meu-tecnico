// =============================================================================
// TELA: Cliente — novo e editar (rotas /cliente/novo e /cliente/:id/editar)
// =============================================================================
// Campos: nome, telefone/WhatsApp (com máscara), endereço 1, endereço 2
// (opcional, escondido atrás de um botão) e observações.
//
// O endereço pode ser preenchido de 4 jeitos (o CEP nunca é obrigatório):
//   1. CEP  -> busca no ViaCEP;
//   2. "Não sei o CEP" -> estado + cidade + rua, e escolhe o resultado;
//   3. "Usar minha localização" -> GPS + busca do endereço pelas coordenadas;
//   4. digitar à mão.
// Os campos do endereço ficam sempre visíveis abaixo, para conferir e corrigir.
//
// Salvar: validarCliente() -> criarCliente() (confere o limite do plano) ou
// atualizarCliente() (o administrador também atualiza os serviços agendados).
// =============================================================================

import { html, bruto, mostrar, aoClicar, aoEnviar, lerCampos, mostrarErrosNosCampos, limparErrosGerais, comCarregando, toast, escolher, avancarEntreCampos } from '../nucleo/ui.js';
import { cabecalho, campoTexto, campoTextoLongo, campoSelecao, botao, aviso, estadoVazio } from '../nucleo/componentes.js';
import { resumoDoPlano } from '../nucleo/sessao.js';
import { ehAdmin } from '../nucleo/permissoes.js';
import { traduzirErro } from '../nucleo/erros.js';
import { ESTADOS_BR, MAXIMO_ENDERECOS } from '../nucleo/constantes.js';
import { buscarCliente, criarCliente, atualizarCliente, listarClientes, mensagemDeBloqueio } from '../servicos/clientes.js';
import { buscarPorCEP, buscarPorRua, obterLocalizacao, buscarPorCoordenadas } from '../servicos/cep.js';
import { contatosSuportados, escolherContato } from '../servicos/contatos.js';
import { validarCliente } from '../dominio/validacoes.js';
import { formatarTelefone, mascararTelefoneDigitando, normalizarWhatsappBR, somenteDigitos } from '../dominio/telefone.js';
import { formatarCEP, novoEndereco } from '../dominio/endereco.js';
import { lerPedidoDaConsulta } from '../dominio/link-horarios.js';
import { acharClientesParecidos, textoDoAvisoDeCliente } from '../dominio/duplicidade.js';
import { telaDeErro } from './clientes-comum.js';

const OPCOES_UF = ESTADOS_BR.map(([sigla, nome]) => ({ valor: sigla, rotulo: `${sigla} — ${nome}` }));

/** Os 4 caminhos para preencher o endereço (id → texto do botão). */
const MODOS = [
  ['cep', 'Tenho o CEP'],
  ['rua', 'Procurar pela rua'],
  ['gps', 'Usar minha localização'],
  ['manual', 'Digitar à mão'],
];

/**
 * Desenha o bloco de um endereço. n = número único do bloco na tela (1, 2, 3...), que vira
 * o prefixo dos campos: "end1_rua". O título ("Endereço", "Endereço 2"...) e o botão
 * "Remover" são ajustados depois por atualizarBlocos().
 * modo: qual caminho já aparece aberto ('cep' para endereço novo, 'manual' ao editar).
 */
function blocoEndereco(n, e, modo) {
  const p = `end${n}_`;
  return html`
    <section class="cartao pilha" data-bloco-endereco="${n}">
      <div class="linha linha--entre">
        <h2 data-titulo-endereco>Endereço</h2>
        <span data-remover-endereco>${botao({ texto: 'Remover', variante: 'perigo', pequeno: true, iconeNome: 'lixeira', acao: 'remover-endereco' })}</span>
      </div>

      <input type="hidden" name="${p}id" value="${e.id}" />
      <input type="hidden" name="${p}lat" value="${e.lat ?? ''}" />
      <input type="hidden" name="${p}lng" value="${e.lng ?? ''}" />

      <div class="campo">
        <span class="campo__rotulo" id="rotulo-modo${n}">Como quer preencher?</span>
        <div class="chips" role="radiogroup" aria-labelledby="rotulo-modo${n}">
          ${MODOS.map(([id, texto]) => html`
            <label class="chip">
              <input type="radio" name="modo${n}" value="${id}" ${id === modo ? bruto('checked') : ''} />
              <span class="chip__texto">${texto}</span>
            </label>`)}
        </div>
      </div>

      <div class="pilha pilha--pequena" data-painel="cep" ${modo === 'cep' ? '' : 'hidden'}>
        <div class="campo" data-campo="${p}cep">
          <label class="campo__rotulo" for="campo-${p}cep">CEP <span class="campo__opcional">(opcional)</span></label>
          <div class="campo__com-botao">
            <input class="campo__entrada" id="campo-${p}cep" name="${p}cep" type="text" inputmode="numeric"
              autocomplete="postal-code" maxlength="9" placeholder="00000-000" value="${formatarCEP(e.cep)}" />
            ${botao({ texto: 'Buscar', variante: 'secundario', acao: 'buscar-cep', dados: { end: n } })}
          </div>
        </div>
      </div>

      <div class="pilha pilha--pequena" data-painel="rua" ${modo === 'rua' ? '' : 'hidden'}>
        ${campoSelecao({ nome: `busca${n}_uf`, rotulo: 'Estado', opcoes: OPCOES_UF, vazio: 'Escolha o estado' })}
        ${campoTexto({ nome: `busca${n}_cidade`, rotulo: 'Cidade', maximo: 80 })}
        ${campoTexto({ nome: `busca${n}_rua`, rotulo: 'Nome da rua', maximo: 120 })}
        ${botao({ texto: 'Procurar', variante: 'secundario', iconeNome: 'buscar', acao: 'buscar-rua', dados: { end: n }, bloco: true })}
        <div class="lista" data-resultados></div>
      </div>

      <div class="pilha pilha--pequena" data-painel="gps" ${modo === 'gps' ? '' : 'hidden'}>
        <p class="texto-suave texto-pequeno">Use quando estiver na casa do cliente. O celular pede permissão para ver onde você está.</p>
        ${botao({ texto: 'Pegar minha localização', variante: 'secundario', iconeNome: 'local', acao: 'usar-gps', dados: { end: n }, bloco: true })}
      </div>

      <p class="campo__ajuda" data-gps-info hidden>Localização guardada: o botão de navegar vai direto ao ponto exato.</p>

      ${campoTexto({ nome: `${p}rua`, rotulo: 'Rua ou avenida', valor: e.rua, maximo: 120, autocompletar: 'off' })}
      <div class="grade-2">
        ${campoTexto({ nome: `${p}numero`, rotulo: 'Número', valor: e.numero, maximo: 15, ajuda: 'Sem número? Escreva S/N.' })}
        ${campoTexto({ nome: `${p}complemento`, rotulo: 'Complemento', valor: e.complemento, opcional: true, maximo: 60 })}
      </div>
      ${campoTexto({ nome: `${p}bairro`, rotulo: 'Bairro', valor: e.bairro, opcional: true, maximo: 80 })}
      <div class="grade-2">
        ${campoTexto({ nome: `${p}cidade`, rotulo: 'Cidade', valor: e.cidade, maximo: 80 })}
        ${campoSelecao({ nome: `${p}uf`, rotulo: 'Estado', opcoes: OPCOES_UF, vazio: 'UF', valor: e.uf, opcional: true })}
      </div>
      ${campoTexto({ nome: `${p}apelido`, rotulo: 'Apelido do endereço', valor: e.apelido, opcional: true, maximo: 40, placeholder: 'Casa, Loja, Escritório...' })}
    </section>`;
}

export default async function montar({ raiz, params, consulta, sessao, ir, voltar, recarregar, ativo }) {
  const empresaId = sessao.vinculo.empresaId;
  const editando = Boolean(params.id);
  const administrador = ehAdmin(sessao);

  // ---- 1. Carrega o cliente (só ao editar) ----
  let cliente = null;
  if (editando) {
    try {
      cliente = await buscarCliente(empresaId, params.id);
    } catch (erro) {
      return telaDeErro(raiz, erro, recarregar, 'Não foi possível abrir o cliente');
    }
    if (!ativo()) return undefined;
    if (!cliente) {
      mostrar(raiz, html`
        ${cabecalho({ titulo: 'Editar cliente', voltarPara: '#/clientes' })}
        ${estadoVazio({ icone: 'info', titulo: 'Cliente não encontrado', texto: 'Ele pode ter sido excluído.', acao: botao({ texto: 'Ver clientes', href: '#/clientes' }) })}`);
      return undefined;
    }
  } else {
    // Cliente novo: se o plano não deixa cadastrar, explica antes de o usuário digitar tudo.
    const plano = resumoDoPlano();
    if (plano && !plano.podeCadastrar) {
      mostrar(raiz, html`
        ${cabecalho({ titulo: 'Novo cliente', voltarPara: '#/clientes' })}
        ${aviso({ tom: 'amarelo', texto: mensagemDeBloqueio({ motivo: plano.motivoBloqueio, limite: plano.limite }) })}
        ${administrador && botao({ texto: 'Ver meu plano', href: '#/plano', bloco: true })}`);
      return undefined;
    }
  }

  // Pedido de um cliente que veio do link de horários (Agendar > "Cadastrar novo cliente"): nome e WhatsApp já vêm
  // preenchidos e, depois de cadastrar, a pessoa volta ao Agendar com o dia e a hora do pedido.
  const pedido = editando ? null : lerPedidoDaConsulta(consulta);

  // ---- 2. Desenha o formulário ----
  const enderecosIniciais = (cliente?.enderecos?.length ? cliente.enderecos : [novoEndereco()]).slice(0, MAXIMO_ENDERECOS);
  const modoInicial = editando ? 'manual' : 'cep';

  mostrar(raiz, html`
    ${cabecalho({ titulo: editando ? 'Editar cliente' : 'Novo cliente', voltarPara: true })}
    <form id="form-cliente" class="formulario" novalidate>
      <div data-erros-gerais></div>

      <section class="cartao pilha">
        <h2>Dados do cliente</h2>
        ${campoTexto({ nome: 'nome', rotulo: 'Nome', valor: cliente?.nome ?? pedido?.nome ?? '', maximo: 120, autocompletar: 'off' })}
        ${campoTexto({
          nome: 'whatsapp', rotulo: 'Telefone (WhatsApp)', tipo: 'tel', modo: 'tel', autocompletar: 'off', maximo: 15,
          valor: cliente ? formatarTelefone(cliente.whatsapp) : (pedido?.whatsapp ? formatarTelefone(pedido.whatsapp) : ''), placeholder: '(11) 91234-5678',
          ajuda: 'Com DDD. É por ele que você chama o cliente e manda o lembrete de retorno.',
        })}
        ${contatosSuportados() && botao({ texto: 'Escolher dos contatos', variante: 'secundario', iconeNome: 'clientes', acao: 'contatos', bloco: true })}
      </section>

      <div id="area-enderecos" class="pilha">${enderecosIniciais.map((e, i) => blocoEndereco(i + 1, e, modoInicial))}</div>
      <div id="area-adicionar-endereco" ${enderecosIniciais.length >= MAXIMO_ENDERECOS ? 'hidden' : ''}>
        ${botao({ texto: 'Adicionar outro endereço', variante: 'secundario', iconeNome: 'mais', acao: 'adicionar-endereco', bloco: true })}
      </div>

      <section class="cartao pilha">
        ${campoTextoLongo({ nome: 'observacoes', rotulo: 'Observações', valor: cliente?.observacoes ?? '', opcional: true, maximo: 1000, placeholder: 'Ex.: portão azul, cachorro bravo, horário preferido...' })}
      </section>

      ${botao({ texto: editando ? 'Salvar alterações' : 'Cadastrar cliente', tipo: 'submit', bloco: true })}
    </form>`);

  const form = raiz.querySelector('#form-cliente');
  const resultadosDaBusca = {}; // resultados da busca por rua (por número de bloco)
  let proximoBloco = enderecosIniciais.length + 1; // próximo número único de bloco

  // ---- 3. Ajudantes para mexer nos campos ----
  const campo = (n, nome) => form.elements[`end${n}_${nome}`];
  const bloco = (n) => form.querySelector(`[data-bloco-endereco="${n}"]`);
  const blocos = () => [...form.querySelectorAll('[data-bloco-endereco]')];

  /** Ajusta o título de cada endereço ("Endereço", "Endereço 2"...), o "Remover" e o botão de adicionar. */
  function atualizarBlocos() {
    const lista = blocos();
    lista.forEach((b, i) => {
      b.querySelector('[data-titulo-endereco]').textContent = i === 0 ? 'Endereço' : `Endereço ${i + 1}`;
      b.querySelector('[data-remover-endereco]').hidden = lista.length === 1;
    });
    form.querySelector('#area-adicionar-endereco').hidden = lista.length >= MAXIMO_ENDERECOS;
  }

  /** Mostra/esconde o aviso de "localização guardada" conforme houver coordenadas. */
  function atualizarAvisoGps(n) {
    const aviso = bloco(n)?.querySelector('[data-gps-info]');
    if (aviso) aviso.hidden = !(campo(n, 'lat').value && campo(n, 'lng').value);
  }

  /** Abre o caminho escolhido (CEP, rua, GPS ou manual) e esconde os outros. */
  function abrirModo(n, modo) {
    const b = bloco(n);
    for (const painel of b.querySelectorAll('[data-painel]')) painel.hidden = painel.dataset.painel !== modo;
  }

  /** Copia um endereço achado (ViaCEP/GPS) para os campos; o número fica como está.
   * Só o GPS traz coordenadas: nos outros caminhos elas são apagadas. */
  function preencherEndereco(n, achado, { manterNumero = true } = {}) {
    const valores = {
      cep: achado.cep ? formatarCEP(achado.cep) : '',
      rua: achado.rua || '',
      bairro: achado.bairro || '',
      cidade: achado.cidade || '',
      uf: achado.uf || '',
      lat: achado.lat ?? '',
      lng: achado.lng ?? '',
    };
    if (!manterNumero || achado.numero) valores.numero = achado.numero || '';
    for (const [nome, valor] of Object.entries(valores)) campo(n, nome).value = valor;
    atualizarAvisoGps(n);
    // O que falta (normalmente o número) recebe o foco.
    (campo(n, 'numero').value ? campo(n, 'rua') : campo(n, 'numero')).focus();
  }

  // Ao editar a rua ou a cidade à mão, as coordenadas antigas deixam de valer.
  form.addEventListener('input', (ev) => {
    const nome = ev.target.name || '';
    const m = /^end(\d+)_(rua|cidade)$/.exec(nome);
    if (m) {
      campo(m[1], 'lat').value = '';
      campo(m[1], 'lng').value = '';
      atualizarAvisoGps(m[1]);
    }
    if (nome === 'whatsapp') ev.target.value = mascararTelefoneDigitando(ev.target.value);
    if (/^end\d+_cep$/.test(nome)) ev.target.value = formatarCEP(ev.target.value);
  });

  // Trocar a forma de preencher o endereço abre o painel certo.
  form.addEventListener('change', (ev) => {
    const m = /^modo(\d+)$/.exec(ev.target.name || '');
    if (m) abrirModo(m[1], ev.target.value);
  });

  // Enter dentro da busca por rua ou do CEP faz a busca (em vez de enviar o formulário).
  form.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    const nome = ev.target.name || '';
    const mCep = /^end(\d+)_cep$/.exec(nome);
    const mBusca = /^busca(\d+)_/.exec(nome);
    if (!mCep && !mBusca) return;
    ev.preventDefault();
    const alvo = form.querySelector(`[data-acao="${mCep ? 'buscar-cep' : 'buscar-rua'}"][data-end="${(mCep || mBusca)[1]}"]`);
    alvo?.click();
  });

  // Enter vai ao próximo campo; o WhatsApp completo (celular com 11 dígitos) já passa para o seguinte.
  avancarEntreCampos(form, {
    automatico: { whatsapp: (v) => somenteDigitos(v).length === 11 && Boolean(normalizarWhatsappBR(v)) },
    validos: { whatsapp: (v) => Boolean(normalizarWhatsappBR(v)) },
  });

  for (const b of blocos()) atualizarAvisoGps(b.dataset.blocoEndereco);
  atualizarBlocos();

  // ---- 4. Botões ----
  const desligarCliques = aoClicar(raiz, {
    voltar: () => voltar('/clientes'),

    // CEP -> ViaCEP
    'buscar-cep': (el) => comCarregando(el, async () => {
      const n = el.dataset.end;
      const achado = await buscarPorCEP(campo(n, 'cep').value);
      if (!achado) {
        mostrarErrosNosCampos(form, { [`end${n}_cep`]: 'CEP não encontrado. Confira os números ou procure pela rua.' });
        return;
      }
      preencherEndereco(n, achado);
      toast('Endereço encontrado. Confira e informe o número.', 'sucesso');
    }),

    // Estado + cidade + rua -> lista de resultados
    'buscar-rua': (el) => comCarregando(el, async () => {
      const n = el.dataset.end;
      const lista = await buscarPorRua({
        uf: form.elements[`busca${n}_uf`].value,
        cidade: form.elements[`busca${n}_cidade`].value,
        rua: form.elements[`busca${n}_rua`].value,
      });
      resultadosDaBusca[n] = lista;
      const area = bloco(n).querySelector('[data-resultados]');
      if (lista.length === 0) {
        mostrar(area, html`<p class="texto-suave">Nenhuma rua encontrada. Confira a cidade e o nome, ou digite à mão.</p>`);
        return;
      }
      mostrar(area, html`
        <p class="texto-suave texto-pequeno">Toque na rua certa:</p>
        ${lista.map((r, i) => html`
          <button type="button" class="item-lista" data-acao="usar-resultado" data-end="${n}" data-indice="${i}">
            <span class="item-lista__textos">
              <span class="item-lista__titulo">${r.rua}</span>
              <span class="item-lista__sub">${[r.bairro, r.cep ? formatarCEP(r.cep) : ''].filter(Boolean).join(' · ')}</span>
            </span>
          </button>`)}`);
    }),

    'usar-resultado': (el) => {
      const n = el.dataset.end;
      const achado = resultadosDaBusca[n][Number(el.dataset.indice)];
      if (!achado) return;
      preencherEndereco(n, achado);
      mostrar(bloco(n).querySelector('[data-resultados]'), '');
    },

    // GPS do celular -> endereço aproximado (confira e corrija)
    'usar-gps': (el) => comCarregando(el, async () => {
      const n = el.dataset.end;
      const posicao = await obterLocalizacao();
      const achado = await buscarPorCoordenadas(posicao);
      preencherEndereco(n, achado, { manterNumero: false });
      toast('Localização encontrada. Confira o endereço e corrija se precisar.', 'sucesso');
    }),

    // Agenda de contatos do celular
    contatos: (el) => comCarregando(el, async () => {
      const contato = await escolherContato();
      if (!contato) return;
      if (contato.nome && !form.elements.nome.value.trim()) form.elements.nome.value = contato.nome;
      if (contato.telefone) {
        const normal = normalizarWhatsappBR(contato.telefone);
        form.elements.whatsapp.value = normal ? formatarTelefone(normal) : mascararTelefoneDigitando(contato.telefone);
      }
    }),

    // Outros endereços (até MAXIMO_ENDERECOS) — entram e saem da tela
    'adicionar-endereco': () => {
      if (blocos().length >= MAXIMO_ENDERECOS) return;
      const n = proximoBloco;
      proximoBloco += 1;
      const area = document.createElement('div');
      mostrar(area, blocoEndereco(n, novoEndereco(), 'cep'));
      raiz.querySelector('#area-enderecos').append(...area.children);
      atualizarBlocos();
      campo(n, 'cep').focus();
    },
    'remover-endereco': (el) => {
      const b = el.closest('[data-bloco-endereco]');
      if (!b || blocos().length <= 1) return;
      delete resultadosDaBusca[b.dataset.blocoEndereco];
      b.remove();
      atualizarBlocos();
    },
  });

  // ---- 5. Salvar ----
  aoEnviar(form, async () => {
    limparErrosGerais(form);
    const c = lerCampos(form);
    const enderecos = blocos().map((b) => Number(b.dataset.blocoEndereco)).map((n) => {
      const e = {};
      for (const nome of ['id', 'apelido', 'cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'lat', 'lng']) e[nome] = c[`end${n}_${nome}`];
      return e;
    });
    const r = validarCliente({ nome: c.nome, whatsapp: c.whatsapp, observacoes: c.observacoes, enderecos });
    if (!r.valido) {
      mostrarErrosNosCampos(form, r.erros);
      return;
    }
    // Endereço novo ainda não tem id: criamos agora (o id liga aparelhos e serviços ao endereço).
    const dados = { ...r.dados, enderecos: r.dados.enderecos.map((e) => ({ ...e, id: e.id || novoEndereco().id })) };

    // Cliente novo parecido com um já cadastrado (mesmo WhatsApp e/ou endereço): só avisa, a pessoa decide.
    let existente = null;
    if (!editando) {
      const parecidos = await listarClientes(empresaId).then((lista) => acharClientesParecidos(lista, dados)).catch(() => []);
      if (parecidos.length > 0) {
        const { cliente: achado, motivos } = parecidos[0];
        const escolha = await escolher({
          titulo: 'Esse cliente já existe?',
          mensagem: `Já existe um cliente cadastrado com essas informações: ${achado.nome}. ${textoDoAvisoDeCliente(motivos)} Deseja consultar o cadastro existente?`,
          opcoes: [{ id: 'abrir', rotulo: 'Consultar o cadastro existente' }, { id: 'mesmo', rotulo: 'Cadastrar mesmo assim' }],
          cancelar: 'Voltar e conferir',
        });
        if (!escolha) return;
        if (escolha === 'abrir') existente = achado;
      }
    }

    await comCarregando(form.querySelector('[type="submit"]'), async () => {
      try {
        if (existente) {
          if (pedido) {
            const q = new URLSearchParams({ cliente: existente.id, pedido: '1', data: pedido.data, hora: pedido.hora, nome: pedido.nome });
            if (pedido.whatsapp) q.set('whatsapp', pedido.whatsapp);
            ir(`/agendar?${q.toString()}`, { substituir: true });
          } else ir(`/cliente/${encodeURIComponent(existente.id)}`, { substituir: true });
          return;
        }
        let id = params.id;
        if (editando) await atualizarCliente(empresaId, id, dados, { administrador });
        else id = await criarCliente(empresaId, dados, sessao.usuario.uid);
        toast(editando ? 'Cliente atualizado.' : 'Cliente cadastrado.', 'sucesso');
        if (editando && consulta?.get('voltar') === '1') voltar('/agendar');
        else if (pedido) {
          const q = new URLSearchParams({ cliente: id, pedido: '1', data: pedido.data, hora: pedido.hora, nome: pedido.nome });
          if (pedido.whatsapp) q.set('whatsapp', pedido.whatsapp);
          ir(`/agendar?${q.toString()}`, { substituir: true });
        } else ir(`/cliente/${encodeURIComponent(id)}`, { substituir: true });
      } catch (erro) {
        mostrarErrosNosCampos(form, { geral: traduzirErro(erro) });
      }
    });
  });

  return desligarCliques;
}
