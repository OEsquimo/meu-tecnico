"""
PACOTE 8 (modo demonstração): espaço do botão "Cadastrar aparelho novo", aparelho no Concluir e destino depois de excluir.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote8.py
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
    escolher_quando(pag, "2031-06-10", "09:00")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    sid = pag.url.split("/servico/")[1]
    informar(pag, servicos=("Limpeza", "Manutenção"))

    # ---- Aparelho no topo de "Concluir serviço" ----
    pag.locator("a:has-text('Concluir serviço')").first.click(); pag.wait_for_timeout(1000)
    ok(pag.locator(".cabecalho__aparelho").count() == 1 and "BTUs" in pag.locator(".cabecalho__aparelho").inner_text(), "Concluir mostra o aparelho (com BTUs) no topo")
    ok("Rua" not in pag.locator(".cabecalho").inner_text(), "Concluir não mostra endereço")
    ok("Ana Lima" in pag.locator(".cabecalho").inner_text(), "Concluir continua mostrando o cliente")

    def concluir_primeiro():
        if "#/concluir/" not in pag.url:
            pag.locator("a:has-text('Concluir serviço')").first.click(); pag.wait_for_timeout(1000)
        if pag.locator("input[name=valor]").count() and pag.locator("input[name=valor]").input_value() == "":
            pag.fill("input[name=valor]", "100,00")
        pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(1500)
        if pag.locator("dialog", has_text="pendente").count():
            pag.locator("dialog button", has_text="Decidir depois").click(); pag.wait_for_timeout(1000)
    concluir_primeiro()   # volta para a visita
    concluir_primeiro()   # último: vai para o Início
    ok(pag.url.endswith("#/") or pag.url.endswith("/"), "os dois concluídos")

    # ---- Excluir concluído a partir do endereço do serviço que será apagado ----
    ir(f"/servico/{sid}")
    ok(pag.locator("[data-acao=excluir-concluido]").count() == 2, "visita com 2 serviços concluídos")
    pag.locator("[data-acao=excluir-concluido]").first.click(); pag.wait_for_timeout(500)
    pag.locator("dialog button", has_text="Continuar").click(); pag.wait_for_timeout(500)
    pag.locator("dialog button", has_text="Excluir de vez").click(); pag.wait_for_timeout(1500)
    ok("#/servico/" in pag.url and "Serviço não encontrado" not in texto(), "excluiu 1 de 2: continua na visita (sem 'Serviço não encontrado')")
    ok(pag.locator("[data-acao=excluir-concluido]").count() == 1, "sobrou 1 serviço na visita")
    pag.locator("[data-acao=excluir-concluido]").first.click(); pag.wait_for_timeout(500)
    pag.locator("dialog button", has_text="Continuar").click(); pag.wait_for_timeout(500)
    pag.locator("dialog button", has_text="Excluir de vez").click(); pag.wait_for_timeout(1500)
    ok(pag.url.endswith("#/") or pag.url.endswith("/"), f"excluiu o último: vai para o Início ({pag.url})")
    ok("Serviço não encontrado" not in texto(), "sem 'Serviço não encontrado' no Início")
    ok(not erros, f"sem erros no console ({erros[:2]})")
    nav.close()
print("FALHAS:" if falhas else "TUDO OK", falhas if falhas else "")
raise SystemExit(1 if falhas else 0)
