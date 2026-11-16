"""
PACOTE 18 (modo demonstração): (1) escolhendo o cliente pela Agenda, só uma linha de texto com dia, hora e técnico
(sem cartão nem botão); depois de escolher o cliente, o cartão "Quando" com "Alterar horário" aparece; (2) Minha conta:
botão "Editar meus dados" (só administrador), com Nome, Nome da empresa e WhatsApp, e volta para Minha conta.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote18.py
"""
import datetime
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1"
SEL = "dialog.seletor"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


def proxima_quarta():
    h = datetime.date.today()
    primeiro = (h.replace(day=1) + datetime.timedelta(days=32)).replace(day=1)
    d = primeiro + datetime.timedelta(days=10)
    while d.weekday() != 2:
        d += datetime.timedelta(days=1)
    return d


with sync_playwright() as p:
    nav = p.chromium.launch()
    erros = []

    def nova():
        c = nav.new_context(viewport={"width": 390, "height": 844})
        pg = c.new_page()
        pg.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: erros.append(str(e)))
        return pg

    def entrar(pg, email):
        pg.goto(BASE + "#/entrar"); pg.wait_for_selector("#form-entrar")
        pg.fill("input[name=email]", email); pg.fill("input[name=senha]", "demo123")
        pg.click("#form-entrar [type=submit]"); pg.wait_for_selector(".menu-topo__item"); pg.wait_for_timeout(1000)

    pag = nova()
    entrar(pag, "demo@meutecnico.app")

    def ir(h):
        pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(900)

    # ---------------- Linha de texto na escolha do cliente ----------------
    ir("/agenda"); pag.wait_for_timeout(400)
    d = proxima_quarta()
    for _ in range(6):
        if pag.locator(f"section[aria-label='Calendário'] [data-dia='{d.isoformat()}']").count() > 0:
            break
        pag.click("[data-acao=mes-seguinte]"); pag.wait_for_timeout(700)
    pag.click(f"section[aria-label='Calendário'] [data-dia='{d.isoformat()}']"); pag.wait_for_timeout(300)
    pag.click("#botao-agendar"); pag.wait_for_selector(f"{SEL}[open]")
    pag.wait_for_function("!document.querySelector('dialog.seletor')?.innerText.includes('Carregando')", timeout=8000)
    pag.click(f"{SEL} [data-acao=seletor-hora][data-hora='09:00']"); pag.wait_for_timeout(200)
    pag.click(f"{SEL} [data-acao=seletor-confirmar]"); pag.wait_for_timeout(1200)

    ok("#/agendar" in pag.url, "chegou na tela de escolher o cliente")
    linha = pag.inner_text("#linha-quando")
    ok("09:00" in linha and "às" in linha and f"{d.day}" in linha, f"linha de texto com o dia e a hora: {linha!r}")
    ok("·" in linha, "a linha traz o técnico")
    ok(pag.locator("#resumo-quando").count() == 0, "sem o cartão 'Quando' na escolha do cliente")
    ok(pag.locator("#botao-quando").count() == 0 and "Alterar horário" not in pag.inner_text("#conteudo"), "sem o botão 'Alterar horário' na escolha do cliente")
    ok(pag.locator("#linha-quando").evaluate("e => e.tagName") == "P", "a linha é só texto (não é botão nem link)")
    ok(pag.locator("#botao-cliente-novo").count() == 1, "o botão 'Cadastrar cliente novo' continua")

    pag.locator("[data-acao=escolher-cliente]", has_text="Maria Souza").click(); pag.wait_for_timeout(700)
    ok(pag.locator("#linha-quando").count() == 0, "depois de escolher o cliente, a linha de texto some")
    ok("09:00" in pag.inner_text("#resumo-quando"), "depois de escolher o cliente, o cartão 'Quando' mostra a hora")
    ok(pag.locator("#botao-quando").inner_text().strip() == "Alterar horário", "e o botão 'Alterar horário' aparece")
    pag.click("[data-acao=trocar-cliente]"); pag.wait_for_timeout(600)
    ok(pag.locator("#linha-quando").count() == 1 and pag.locator("#resumo-quando").count() == 0, "'Não é o cliente?' volta para a linha de texto")

    # ---------------- Minha conta: editar meus dados ----------------
    ir("/conta")
    ok(pag.locator("#botao-editar-conta").count() == 1, "Minha conta tem o botão 'Editar meus dados'")
    corpo = pag.inner_text("#conteudo")
    ok("E-mail" in corpo and "Papel" in corpo and "Empresa" in corpo, "Minha conta continua mostrando e-mail, papel e empresa")
    pag.click("#botao-editar-conta"); pag.wait_for_selector("#form-admin"); pag.wait_for_timeout(300)
    ok("#/equipe/eu" in pag.url, "o botão abre a tela de editar meus dados")
    ok(pag.locator("input[name=nome]").count() == 1 and pag.locator("input[name=nomeEmpresa]").count() == 1 and pag.locator("input[name=telefone]").count() == 1,
       "a tela tem Nome, Nome da empresa e WhatsApp")
    ok(pag.locator("input[name=email]").count() == 0, "o e-mail não pode ser editado aqui")
    ok(pag.locator("input[name=nomeEmpresa]").input_value() != "", "o nome da empresa vem preenchido")
    pag.click(".cabecalho__voltar"); pag.wait_for_timeout(600)
    ok("#/conta" in pag.url, "a seta de voltar leva de volta para Minha conta")

    pag.click("#botao-editar-conta"); pag.wait_for_selector("#form-admin")
    pag.fill("input[name=nome]", "Well Teste")
    pag.fill("input[name=nomeEmpresa]", "")
    pag.click("#form-admin [type=submit]"); pag.wait_for_timeout(500)
    ok("#/equipe/eu" in pag.url and "empresa" in pag.inner_text("#form-admin").lower(), "nome da empresa vazio: avisa e não salva")
    pag.fill("input[name=nomeEmpresa]", "Frio Novo Ltda")
    pag.fill("input[name=telefone]", "123")
    pag.click("#form-admin [type=submit]"); pag.wait_for_timeout(500)
    ok("#/equipe/eu" in pag.url and "inválido" in pag.inner_text("#form-admin").lower(), "WhatsApp inválido: avisa e não salva")
    pag.fill("input[name=telefone]", "81983259346")
    ok(pag.locator("input[name=telefone]").input_value() == "(81) 98325-9346", "o WhatsApp vai ganhando a máscara")
    pag.click("#form-admin [type=submit]"); pag.wait_for_timeout(1500)
    ok("#/conta" in pag.url, "ao salvar, volta para Minha conta")
    corpo = pag.inner_text("#conteudo")
    ok("Well Teste" in corpo and "Frio Novo Ltda" in corpo and "(81) 98325-9346" in corpo, f"Minha conta mostra o nome, a empresa e o telefone novos")

    # Pelo caminho antigo (Equipe → Você) continua funcionando e volta para a Equipe
    ir("/equipe"); pag.click("a[href='#/equipe/eu']"); pag.wait_for_selector("#form-admin")
    ok(pag.locator("input[name=nomeEmpresa]").input_value() == "Frio Novo Ltda", "Equipe → Você também edita (e mostra a empresa nova)")
    pag.click("#form-admin [type=submit]"); pag.wait_for_timeout(1200)
    ok("#/equipe" in pag.url and "#/conta" not in pag.url, "por esse caminho, salvar volta para a Equipe")

    # ---------------- Técnico não vê o botão ----------------
    tec = nova()
    entrar(tec, "tecnico@meutecnico.app")
    tec.evaluate("location.hash='#/conta'"); tec.wait_for_timeout(900)
    ok(tec.locator("#botao-editar-conta").count() == 0, "técnico não vê 'Editar meus dados'")
    tec.evaluate("location.hash='#/equipe/eu'"); tec.wait_for_timeout(900)
    ok("#/equipe/eu" not in tec.url, "técnico não abre a tela de editar dados do administrador")

    ok(not [e for e in erros if "favicon" not in e], f"sem erros no console: {erros[:3]}")
    nav.close()

print("\nFALHAS:" if falhas else "\nTudo certo.", falhas or "")
raise SystemExit(1 if falhas else 0)
