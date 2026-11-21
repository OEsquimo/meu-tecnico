"""
PACOTE 24 (modo demonstração):
 A) Enviar horários (administrador): não escolhe mais o serviço; o link oferece os tipos de serviço ao cliente.
 B) Página do cliente: escolhe o(s) serviço(s) (nome só), "Não sei ainda" vale sozinho; mensagem com 🔧 e link do app separado.
 C) Agendar: aviso "Serviços pedidos" (só informativo).
 D) Agenda: cancelado de hoje continua aparecendo no dia de hoje.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote24.py
"""
import re
import urllib.parse
from playwright.sync_api import sync_playwright
from _quando import _abrir_dia, SELETOR

BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={"width": 390, "height": 844})
    ctx.add_init_script(path='testes/telas/sem-aviso.js')
    pag = ctx.new_page()
    erros = []
    pag.on("pageerror", lambda e: erros.append(str(e)))
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    # A) administrador
    pag.evaluate("location.hash='#/ferramentas/horarios'"); pag.wait_for_timeout(1500)
    if pag.locator("#form-whatsapp").count():
        pag.fill("input[name=telefone]", "81983259341"); pag.click("#form-whatsapp [type=submit]"); pag.wait_for_timeout(1500)
    ok(pag.locator("label.chip").count() == 0 and "Qual serviço" not in pag.inner_text("body"), "o administrador não escolhe serviço ao enviar os horários")
    link = re.search(r"https?://\S+#/horarios\?\S+", pag.inner_text("#mensagem-previa")).group(0)
    ok("ts=" in link, "o link leva os tipos de serviço para o cliente escolher")

    # B) cliente
    ctx2 = nav.new_context(viewport={"width": 390, "height": 844})
    cli = ctx2.new_page()
    cli.on("pageerror", lambda e: erros.append(str(e)))
    cli.goto(link); cli.wait_for_selector("#area-calendario"); cli.wait_for_timeout(500)
    ok("Qual serviço você precisa?" in cli.inner_text("body"), "o cliente vê 'Qual serviço você precisa?'")
    chips = cli.locator("#area-servicos label.chip")
    ok(chips.count() >= 2 and chips.filter(has_text="Não sei ainda").count() == 1, "serviços só com o nome, mais 'Não sei ainda'")
    # Não sei ainda é exclusivo
    chips.filter(has_text="Instalação").click(); chips.filter(has_text="Limpeza").click(); cli.wait_for_timeout(150)
    ok(cli.locator("#area-servicos input:checked").count() == 2, "pode marcar vários serviços")
    chips.filter(has_text="Não sei ainda").click(); cli.wait_for_timeout(150)
    ok(cli.locator("#area-servicos input:checked").count() == 1, "'Não sei ainda' vale sozinho")
    chips.filter(has_text="Instalação").click(); cli.wait_for_timeout(150)
    ok(cli.locator("#area-servicos input:checked").count() == 1, "marcar um serviço desmarca 'Não sei ainda'")
    chips.filter(has_text="Limpeza").click(); cli.wait_for_timeout(150)
    cli.locator("[data-acao=dia]:not([disabled])").first.click(); cli.wait_for_timeout(300)
    cli.locator("[data-acao=hora]").first.click(); cli.wait_for_timeout(400)
    cli.fill("input[name=nome]", "Cláudia"); cli.fill("input[name=whatsapp]", "81 99999-1234")
    cli.fill("input[name=rua]", "Rua A"); cli.fill("input[name=numero]", "10"); cli.fill("input[name=cidade]", "Recife")
    cli.click("#form-pedido [type=submit]"); cli.wait_for_timeout(600)
    zap = urllib.parse.unquote(cli.get_attribute("#enviar-pedido", "href"))
    ok("🔧 Instalação, Limpeza" in zap or "🔧 Limpeza, Instalação" in zap, "a mensagem leva os serviços pedidos (🔧)")
    ok(zap.index("📱") < zap.index("🔧"), "🔧 vem depois do WhatsApp")
    ok("— Técnico: abrir no app\n\nhttp" in zap, "o link do app fica separado, no fim, por uma linha em branco")
    link_app = re.search(r"https?://\S+#/agendar\?\S+", zap).group(0)

    # C) Agendar
    pag.goto(link_app); pag.wait_for_timeout(2500)
    ok("Serviços pedidos:" in pag.inner_text("body"), "Agendar mostra 'Serviços pedidos' no aviso do pedido")

    # D) cancelado de hoje aparece na Agenda de hoje
    pag.evaluate("location.hash='#/agendar'"); pag.wait_for_timeout(900)
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(600)
    from datetime import date
    hoje = date.today().isoformat()
    _abrir_dia(pag, hoje)
    horas = pag.locator(f"{SELETOR} [data-acao=seletor-hora]:not([disabled])")
    if horas.count() == 0:
        print("  (sem horário livre hoje: parte D ignorada)")
        pag.keyboard.press("Escape")
    else:
        horas.last.click(); pag.click(f"{SELETOR} [data-acao=seletor-confirmar]"); pag.wait_for_timeout(300)
        pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
        pag.click("[data-acao=cancelar]"); pag.wait_for_timeout(400)
        pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1200)
        pag.evaluate("location.hash='#/agenda'"); pag.wait_for_timeout(1500)
        ok("Cancelado" in pag.inner_text("#conteudo").split("Agendar hoje")[-1], "Agenda: o cancelado de hoje aparece no dia de hoje")

    ok(not erros, f"sem erros de JavaScript ({erros[:2]})")
    nav.close()

print("\nFALHAS:", len(falhas))
raise SystemExit(1 if falhas else 0)
