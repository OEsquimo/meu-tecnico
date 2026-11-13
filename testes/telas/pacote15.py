"""
PACOTE 15 (modo demonstração): calendário único na tela Agendar + tela flutuante, técnico equilibrado,
regra "um aparelho, um agendamento aberto", atraso do técnico e pontos verde/amarelo do histórico na Agenda.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote15.py
"""
from playwright.sync_api import sync_playwright
from _quando import escolher_quando, _abrir_dia, SELETOR, CALENDARIO as CAL
BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


with sync_playwright() as p:
    nav = p.chromium.launch()
    pag = nav.new_page(viewport={"width": 390, "height": 844})
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))

    def ir(h):
        pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1000)

    def texto():
        return pag.inner_text("#conteudo")

    def novo_agendamento(cliente):
        ir("/agenda"); ir("/agendar")
        pag.locator("[data-acao=escolher-cliente]", has_text=cliente).click(); pag.wait_for_timeout(600)

    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    # ---------------- Calendário único + tela flutuante ----------------
    novo_agendamento("Maria Souza")
    ok(pag.locator(f"{CAL} .calendario").count() == 1, "o calendário fica na própria tela Agendar")
    ok(pag.locator("dialog[open]").count() == 0, "nada flutuante aberto antes de tocar num dia")
    escolher_quando(pag, "2031-09-01", "09:00", tecnico="Marcos")
    ok("Marcos" in pag.inner_text("#botao-quando") and "01/09/2031" in pag.inner_text("#botao-quando"), "escolher dia, hora e técnico na tela flutuante preenche o 'Quando'")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url, "agendou (Marcos às 09:00 em 01/09/2031)")

    # técnico equilibrado: Marcos já tem 1 h no dia, Rafael nada → Rafael já vem marcado
    novo_agendamento("Ana Lima")
    _abrir_dia(pag, "2031-09-01")
    ok(pag.locator(f"{SELETOR} .calendario").count() == 0, "a tela flutuante não tem outro calendário")
    pag.click(f"{SELETOR} [data-acao=seletor-hora][data-hora='14:00']")
    marcados = pag.locator(f"{SELETOR} .tecnico-opcao:has(input:checked)").all_inner_texts()
    ok(len(marcados) == 1 and "Rafael" in marcados[0], f"o técnico com menos serviço no dia já vem marcado ({marcados})")
    pag.click(f"{SELETOR} [data-acao=seletor-fechar]"); pag.wait_for_selector(SELETOR, state="detached")

    # ---------------- Um aparelho, um agendamento aberto ----------------
    novo_agendamento("Maria Souza")
    pag.click("[data-acao=adicionar-aparelho]"); pag.wait_for_timeout(300)
    pag.locator("dialog [data-escolha]", has_text="Quarto").first.click(); pag.wait_for_timeout(300)
    pag.locator("[data-acao=adicionar-servico]").first.click(); pag.wait_for_timeout(300)
    pag.locator("dialog [data-escolha]", has_text="Limpeza").first.click(); pag.wait_for_timeout(300)
    escolher_quando(pag, "2031-09-02", "09:00")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url, "primeiro agendamento do aparelho Quarto é aceito")
    primeiro_url = pag.url

    novo_agendamento("Maria Souza")
    pag.click("[data-acao=adicionar-aparelho]"); pag.wait_for_timeout(300)
    pag.locator("dialog [data-escolha]", has_text="Quarto").first.click(); pag.wait_for_timeout(300)
    pag.locator("[data-acao=adicionar-servico]").first.click(); pag.wait_for_timeout(300)
    pag.locator("dialog [data-escolha]", has_text="Manutenção").first.click(); pag.wait_for_timeout(300)
    escolher_quando(pag, "2031-09-03", "09:00")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1200)
    dialogo = pag.inner_text("dialog[open]") if pag.locator("dialog[open]").count() else ""
    ok("Este aparelho já tem um serviço agendado" in dialogo and "02/09/2031 às 09:00" in dialogo, "outro agendamento para o mesmo aparelho é barrado, mostrando o que já existe")
    ok("edite o agendamento que já existe" in dialogo, "a mensagem diz o que fazer: editar o agendamento existente")
    pag.locator("dialog[open] [data-escolha=abrir]").click(); pag.wait_for_timeout(1200)
    ok(pag.url == primeiro_url, "'Abrir agendamento' leva ao agendamento que já existe")

    # cancelar libera o aparelho
    pag.click("[data-acao=cancelar]"); pag.wait_for_timeout(400)
    pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1200)
    novo_agendamento("Maria Souza")
    pag.click("[data-acao=adicionar-aparelho]"); pag.wait_for_timeout(300)
    pag.locator("dialog [data-escolha]", has_text="Quarto").first.click(); pag.wait_for_timeout(300)
    pag.locator("[data-acao=adicionar-servico]").first.click(); pag.wait_for_timeout(300)
    pag.locator("dialog [data-escolha]", has_text="Manutenção").first.click(); pag.wait_for_timeout(300)
    escolher_quando(pag, "2031-09-03", "09:00")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url, "com o agendamento anterior cancelado, o aparelho volta a poder ser agendado")

    # outro aparelho do mesmo cliente e agendamento sem aparelho nunca são barrados
    r = pag.evaluate("""async () => {
      const o = location.origin + '/js/';
      const S = await import(o + 'servicos/servicos.js');
      const C = await import(o + 'servicos/clientes.js');
      const E = await import(o + 'servicos/equipe.js');
      const { sessao } = await import(o + 'nucleo/sessao.js');
      const { CONTAS_DEMO } = await import(o + 'nucleo/demonstracao.js');
      const empresaId = sessao.vinculo.empresaId;
      const clientes = await C.listarClientes(empresaId);
      const ana = clientes.find((c) => c.id === 'c-ana');
      const maria = clientes.find((c) => c.id === 'c-maria');
      const rafael = { uid: CONTAS_DEMO.tecnico.uid, nome: 'Rafael Costa' };
      const admin = { uid: empresaId, nome: 'Marcos Frio' };
      const base = (cliente, data, hora, tecnicos) => ({ empresaId, cliente, endereco: cliente.enderecos[0], data, hora, tecnicos, linhas: [], regras: null });
      const saida = {};
      const tenta = async (nome, f) => { try { await f(); saida[nome] = 'ok'; } catch (e) { saida[nome] = e.codigo || e.code || e.message; } };

      // ---- Atraso do técnico (só administrador): 05/09/2031, "agora" = 11:00 ----
      const agora = new Date(2031, 8, 5, 11, 0);
      await tenta('a1', () => S.salvarAgendamento(base(maria, '2031-09-05', '09:00', [rafael])));   // Rafael: devia acabar às 10:00
      await tenta('b1', () => S.salvarAgendamento(base(ana, '2031-09-05', '11:00', [rafael])));      // próximo do Rafael, às 11:00
      saida.ajustados = await S.conferirAtrasosDoDia({ empresaId, tecnicos: [admin, rafael], agora });
      const dia5 = await S.listarAgendados({ empresaId, de: new Date(2031, 8, 5), ate: new Date(2031, 8, 6) });
      const b1 = dia5.find((l) => l.clienteId === 'c-ana');
      saida.b1 = { uids: b1.tecnicoUids, de: b1.reatribuidoDeNome, vista: b1.reatribuicaoVista, atrasado: b1.atrasoPorTecnico === true };
      saida.naoVistos = (await S.listarReatribuidosNaoVistos({ empresaId })).length;
      saida.denovo = await S.conferirAtrasosDoDia({ empresaId, tecnicos: [admin, rafael], agora });   // nada novo a ajustar

      // ---- Sem outro técnico livre: o próximo fica Atrasado (06/09/2031) ----
      await tenta('a2', () => S.salvarAgendamento(base(maria, '2031-09-06', '09:00', [rafael])));
      await tenta('b2', () => S.salvarAgendamento(base(ana, '2031-09-06', '11:00', [rafael])));
      await tenta('m2', () => S.salvarAgendamento(base(clientes.find((c) => c.id === 'c-joao'), '2031-09-06', '10:30', [admin])));
      saida.ajustados2 = await S.conferirAtrasosDoDia({ empresaId, tecnicos: [admin, rafael], agora: new Date(2031, 8, 6, 11, 0) });
      const dia6 = await S.listarAgendados({ empresaId, de: new Date(2031, 8, 6), ate: new Date(2031, 8, 7) });
      const b2 = dia6.find((l) => l.clienteId === 'c-ana');
      saida.b2 = { uids: b2.tecnicoUids, atrasado: b2.atrasoPorTecnico === true, nome: b2.atrasoTecnicoNome };
      return saida;
    }""")
    ok(r["a1"] == "ok" and r["b1"] != "ok", "cenário do atraso montado")
    ok(r["ajustados"] == 1 and r["b1"]["de"] == "Rafael Costa" and "rafael" not in "".join(r["b1"]["uids"]).lower() and not r["b1"]["atrasado"] and r["b1"]["vista"] is False,
       f"técnico passou do tempo: o próximo agendamento dele foi para outro técnico livre ({r['b1']})")
    ok(r["naoVistos"] == 1, "a troca fica na lista de avisos do administrador")
    ok(r["denovo"] == 0, "conferir de novo não repete o ajuste")
    ok(r["ajustados2"] == 1 and r["b2"]["atrasado"] and r["b2"]["uids"] != [] and r["b2"]["nome"] == "Rafael Costa",
       f"sem outro técnico livre: o próximo agendamento fica Atrasado ({r['b2']})")

    # Início do administrador mostra o aviso da troca; abrir o agendamento marca como visto
    ir("/")
    pag.wait_for_timeout(800)
    ok("passou para" in texto() and "ainda está em outro serviço" in texto(), "Início do administrador avisa que o agendamento passou para outro técnico")
    pag.locator("a:has-text('passou para')").first.click(); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url and "passou de" in texto().lower() and "rafael" in texto().lower(), "o cartão do agendamento mostra de quem ele passou")
    ir("/"); pag.wait_for_timeout(800)
    ok("passou para" not in texto(), "depois de aberto, o aviso some")

    # ---------------- Agenda: histórico ----------------
    ir("/agenda"); pag.wait_for_timeout(800)
    def pontos(cor):
        return pag.locator(f"section[aria-label='Calendário'] .calendario__ponto--{cor}").count()
    achou = pontos("verde") > 0
    if not achou:
        pag.click("[data-acao=mes-anterior]"); pag.wait_for_timeout(1000)
        achou = pontos("verde") > 0
    ok(achou, "dias que já passaram com serviço concluído têm ponto verde na Agenda")
    passado = pag.locator("section[aria-label='Calendário'] .calendario__dia:has(.calendario__ponto--verde)").first
    ok("calendario__dia--passado" in (passado.get_attribute("class") or ""), "dia que já passou fica em cinza")
    passado.click(); pag.wait_for_timeout(500)
    ok(pag.locator("#botao-agendar").count() == 0, "dia que já passou não tem o botão Agendar")
    ok("Concluído" in texto() or "concluí" in texto().lower(), "tocar no dia passado mostra o que foi concluído")
    ir("/"); ir("/agenda"); pag.wait_for_timeout(800)
    ok(pag.locator("#botao-agendar").count() == 1, "hoje continua com o botão Agendar")

    ok(not erros, f"sem erros no console ({erros[:2]})")
    nav.close()
print("FALHAS:" if falhas else "TUDO OK", falhas if falhas else "")
raise SystemExit(1 if falhas else 0)
