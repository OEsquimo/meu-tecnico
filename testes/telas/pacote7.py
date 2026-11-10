"""
PACOTE 7 (modo demonstração): depois de concluir um serviço, volta para a visita enquanto sobrar serviço aberto.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote7.py
"""
from playwright.sync_api import sync_playwright
from _quando import escolher_quando, tecnicos_no_horario, informar
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
    def ir(h): pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(900)
    def texto(): return pag.inner_text("#conteudo")
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(600)
    escolher_quando(pag, "2031-05-10", "09:00")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    informar(pag, servicos=("Limpeza", "Manutenção"))
    ok(pag.locator("a:has-text('Concluir serviço')").count() == 2, "visita com 2 serviços, cada um com Concluir")

    def concluir_primeiro():
        pag.locator("a:has-text('Concluir serviço')").first.click(); pag.wait_for_timeout(1000)
        if pag.locator("select[name=aparelhoId]").count() and pag.locator("select[name=aparelhoId]").input_value() == "":
            pag.locator("select[name=aparelhoId]").select_option(index=1)
        if pag.locator("input[name=valor]").count() and pag.locator("input[name=valor]").input_value() == "":
            pag.fill("input[name=valor]", "100,00")
        pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(1500)
        if pag.locator("dialog", has_text="pendente").count():
            pag.locator("dialog button", has_text="Decidir depois").click(); pag.wait_for_timeout(1000)

    concluir_primeiro()
    ok("#/servico/" in pag.url, f"concluiu o 1º: volta para a visita ({pag.url})")
    ok(pag.locator("a:has-text('Concluir serviço')").count() == 1, "na visita, o outro serviço continua com Concluir")
    concluir_primeiro()
    ok(pag.url.endswith("#/") or pag.url.endswith("/"), f"concluiu o último: vai para o Início ({pag.url})")
    ok(not erros, f"sem erros no console ({erros[:2]})")
    nav.close()
print("FALHAS:" if falhas else "TUDO OK", falhas if falhas else "")
raise SystemExit(1 if falhas else 0)
