"""
PACOTE 12 (modo demonstração): o administrador edita os próprios dados (Equipe > Você) e escolhe se atende serviços.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote12.py
"""
from playwright.sync_api import sync_playwright
from _quando import tecnicos_no_horario
BASE = "http://localhost:5173/?demo=1"
falhas = []
def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c: falhas.append(m)

with sync_playwright() as p:
    nav = p.chromium.launch(); pag = nav.new_page(viewport={"width": 390, "height": 844})
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))
    def ir(h): pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1000)
    def texto(): return pag.inner_text("#conteudo")
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    ir("/equipe")
    ok("Administrador · acesso total" in texto(), "cartão 'Você' na Equipe")
    pag.locator("a:has-text('Você')").first.click(); pag.wait_for_timeout(900)
    ok("#/equipe/eu" in pag.url and pag.locator("input[name=nome]").count() == 1, "o cartão 'Você' abre 'Meus dados'")
    ok(pag.locator("input[name=atende]").is_checked(), "'Eu atendo serviços' começa ligado")
    ok(pag.locator("text=Bloquear").count() == 0 and pag.locator("text=Remover").count() == 0, "sem Bloquear nem Remover para o administrador")
    nome_antes = pag.input_value("input[name=nome]")

    # validação
    pag.fill("input[name=nome]", ""); pag.click("#form-admin [type=submit]"); pag.wait_for_timeout(500)
    ok("Digite o seu nome" in pag.inner_text("body"), "nome vazio mostra erro")
    pag.fill("input[name=nome]", nome_antes); pag.fill("input[name=telefone]", "123"); pag.click("#form-admin [type=submit]"); pag.wait_for_timeout(500)
    ok("Número inválido" in pag.inner_text("body"), "WhatsApp inválido mostra erro")

    # editar dados
    pag.fill("input[name=nome]", nome_antes + " Junior"); pag.fill("input[name=telefone]", "81983259341")
    pag.click("#form-admin [type=submit]"); pag.wait_for_timeout(1500)
    ok("#/equipe" in pag.url and "/eu" not in pag.url, "salvou e voltou para a Equipe")
    ir("/equipe/eu")
    ok(pag.input_value("input[name=nome]") == nome_antes + " Junior", "o nome novo ficou salvo")
    ok("98325-9341" in pag.input_value("input[name=telefone]"), "o WhatsApp novo ficou salvo")

    # técnicos disponíveis: ligado
    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(600)
    com = tecnicos_no_horario(pag, "2031-10-14", "09:00") or []
    ok(any("(eu)" in t for t in com) and any("Rafael" in t for t in com), f"ligado: administrador e funcionário aparecem ({com})")

    # desligar
    ir("/equipe/eu")
    pag.locator("input[name=atende]").uncheck(force=True); pag.click("#form-admin [type=submit]"); pag.wait_for_timeout(1500)
    ok("não atende serviços" in texto(), "Equipe mostra 'Administrador · não atende serviços'")
    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(600)
    sem = tecnicos_no_horario(pag, "2031-10-14", "09:00") or []
    ok(len(sem) >= 1 and not any("(eu)" in t for t in sem) and any("Rafael" in t for t in sem), f"desligado: só o funcionário aparece ({sem})")

    # ligar de novo
    ir("/equipe/eu")
    ok(not pag.locator("input[name=atende]").is_checked(), "o interruptor ficou desligado")
    pag.locator("input[name=atende]").check(force=True); pag.click("#form-admin [type=submit]"); pag.wait_for_timeout(1500)
    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(600)
    volta = tecnicos_no_horario(pag, "2031-10-14", "09:00") or []
    ok(any("(eu)" in t for t in volta), "ligado de novo: o administrador volta a aparecer")
    ok(not erros, f"sem erros no console ({erros[:2]})")
    nav.close()
print("FALHAS:" if falhas else "TUDO OK", falhas if falhas else "")
raise SystemExit(1 if falhas else 0)
