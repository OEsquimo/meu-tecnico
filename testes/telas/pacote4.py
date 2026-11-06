"""
PACOTE 4 (modo demonstração): WhatsApp sem duplicar e técnico que corrige/exclui só o serviço que acrescentou.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote4.py
"""
from playwright.sync_api import sync_playwright
BASE = "http://localhost:5173/?demo=1"
falhas = []
def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c: falhas.append(m)

def entrar(pag, email):
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

with sync_playwright() as p:
    nav = p.chromium.launch(); pag = nav.new_page(viewport={"width": 390, "height": 844})
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))
    def texto(): return pag.inner_text("#conteudo")
    def sem_rolagem(): return pag.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")

    # ---- Técnico: serviço do administrador não tem Editar/Excluir; o que ele adiciona tem ----
    entrar(pag, "tecnico@meutecnico.app")
    pag.locator("#conteudo a[href^='#/servico/']").first.click(); pag.wait_for_timeout(900)
    ok(pag.locator("[data-acao=editar-adicionado], [data-acao=excluir-adicionado]").count() == 0, "serviço do administrador: técnico sem Editar/Excluir")
    ok(pag.locator("[data-acao=excluir], [data-acao=cancelar]").count() == 0, "técnico sem Cancelar/Excluir da visita")
    ok(pag.locator("a:has-text('Ir até o cliente'), button:has-text('Ir até o cliente')").count() == 1 and sem_rolagem(), "Ir até o cliente em linha própria, sem rolagem lateral")
    pag.click("[data-acao=adicionar-servico]"); pag.wait_for_timeout(500)
    pag.locator("dialog [data-escolha]").first.click(); pag.wait_for_timeout(600)
    pag.locator("dialog [data-escolha]").first.click(); pag.wait_for_timeout(1500)
    ok(pag.locator("[data-acao=editar-adicionado]").count() == 1 and pag.locator("[data-acao=excluir-adicionado]").count() == 1, "serviço adicionado pelo técnico: Editar e Excluir")
    pag.click("[data-acao=editar-adicionado]"); pag.wait_for_timeout(500)
    pag.locator("dialog [data-escolha]").first.click(); pag.wait_for_timeout(1500)
    ok(pag.locator("[data-acao=editar-adicionado]").count() == 1, "editar troca o serviço e continua aberto")
    ok("Incluído pelo técnico" in texto(), "serviço adicionado mostra o selo 'Incluído pelo técnico'")
    # Segundo serviço fica (para o administrador ver); este é excluído.
    pag.click("[data-acao=excluir-adicionado]"); pag.wait_for_timeout(400)
    pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1500)
    ok(pag.locator("[data-acao=excluir-adicionado]").count() == 0, "excluir remove o serviço adicionado")
    pag.click("[data-acao=adicionar-servico]"); pag.wait_for_timeout(500)
    pag.locator("dialog [data-escolha]").first.click(); pag.wait_for_timeout(600)
    pag.locator("dialog [data-escolha]").first.click(); pag.wait_for_timeout(1500)
    ok(pag.locator("[data-acao=editar-adicionado]").count() == 1, "técnico incluiu outro serviço para o administrador ver")

    # ---- Administrador: concluído a receber tem Cobrar e não repete o WhatsApp ----
    pag.goto(BASE + "#/entrar"); pag.reload(); pag.wait_for_timeout(800)  # sai da conta, mas os dados de exemplo ficam
    entrar(pag, "demo@meutecnico.app")
    ok("incluiu 1 serviço em campo" in texto(), "Início do administrador avisa: técnico incluiu serviço em campo")
    pag.locator("a.aviso-link:has-text('em campo')").click(); pag.wait_for_timeout(1000)
    ok("Incluído pelo técnico" in texto(), "o serviço aparece com o selo 'Incluído pelo técnico'")
    pag.evaluate("location.hash='#/'"); pag.wait_for_timeout(1000)
    ok("em campo" not in texto(), "depois de abrir, o aviso some do Início")
    pag.evaluate("location.hash='#/historico'"); pag.wait_for_timeout(1000)
    achou = False
    for i in range(pag.locator("#resultado a[href^='#/servico/']").count()):
        pag.evaluate("location.hash='#/historico'"); pag.wait_for_timeout(700)
        pag.locator("#resultado a[href^='#/servico/']").nth(i).click(); pag.wait_for_timeout(800)
        if pag.locator("[data-acao=cobrar]").count() > 0:
            achou = True
            ok(pag.locator("a:has-text('WhatsApp'):not([data-acao])").count() == 0, "com Cobrar, o botão WhatsApp simples some")
            ok(sem_rolagem(), "detalhe sem rolagem lateral")
            break
    ok(achou, "há concluído a receber para testar")
    ok(not erros, f"sem erros no console ({erros[:2]})")
    nav.close()
print("FALHAS:" if falhas else "TUDO OK", falhas if falhas else "")
raise SystemExit(1 if falhas else 0)
