"""
PACOTE 1 (modo demonstração): cancelar -> aguardando reagendamento -> reagendar,
excluir agendamento, histórico "Serviços concluídos" (busca e filtros) e nome do
cliente sem repetir.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote1.py
"""
from playwright.sync_api import sync_playwright
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
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item")
    def ir(h): pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(900)
    def texto(): return pag.inner_text("#conteudo")

    # ---- Histórico = "Serviços concluídos" ----
    ir("/historico")
    ok("Serviços concluídos" in texto(), "a página se chama 'Serviços concluídos'")
    ok(pag.locator("#busca").get_attribute("placeholder") == "Buscar cliente", "busca é por cliente")
    ok(pag.locator("#filtros").count() == 1 and "Filtrar" in texto(), "tem filtros de serviço, técnico e período")
    ok("Limpar" not in texto(), "sem botão 'Limpar filtro'")
    itens = pag.locator("#resultado a[href^='#/servico/']")
    total = itens.count()
    ok(total > 0, f"lista concluídos ({total})")
    ok(total <= 30, "no máximo 30 por vez")
    nome = itens.first.locator(".item-lista__titulo").inner_text().strip()
    pag.fill("#busca", nome); pag.wait_for_timeout(900)
    ok(pag.locator("#resultado a[href^='#/servico/']").count() >= 1, "buscar o nome do cliente acha os serviços dele")
    pag.fill("#busca", "zzzxxyy"); pag.wait_for_timeout(900)
    ok("Nada encontrado" in texto(), "busca sem resultado avisa")
    pag.fill("#busca", ""); pag.wait_for_timeout(900)
    ok(pag.locator("#resultado a[href^='#/servico/']").count() == total, "limpar a busca volta a lista")
    pag.locator("#filtros summary").click()
    pag.fill("input[name=de]", "2099-01-01"); pag.dispatch_event("input[name=de]", "change"); pag.wait_for_timeout(900)
    ok("Nada encontrado" in texto(), "período sem serviços não mostra nada")
    pag.fill("input[name=de]", ""); pag.dispatch_event("input[name=de]", "change"); pag.wait_for_timeout(900)
    ok(pag.locator("#resultado a[href^='#/servico/']").count() == total, "tirar o período volta a lista")

    # ---- Concluído não pode ser excluído ----
    pag.locator("#resultado a[href^='#/servico/']").first.click(); pag.wait_for_timeout(900)
    ok(pag.locator("[data-acao=excluir-concluido]").count() >= 1 and pag.locator("[data-acao=editar-concluido]").count() >= 1, "concluído do admin tem Editar e Excluir")
    ok("registro e garantia" in texto(), "explica que concluído é registro e garantia")

    # ---- Nome do cliente não se repete no topo ----
    ir("/agenda")
    link = pag.locator("#conteudo a[href^='#/servico/']").first
    ok(link.count() > 0, "há agendamento para testar")
    link.click(); pag.wait_for_timeout(900)
    cliente = pag.locator("#conteudo dt:has-text('Cliente') + dd, #conteudo .dado:has-text('Cliente')").first
    cab = pag.locator("#conteudo .cabecalho, #conteudo header").first.inner_text()
    nome_cli = texto().split("Cliente")[1].strip().split("\n")[0].strip() if "Cliente" in texto() else ""
    ok(nome_cli != "" and cab.count(nome_cli) == 0, f"nome do cliente não repete no cabeçalho ({nome_cli})")
    ok(pag.locator("[data-acao=excluir]").count() == 1 and "Excluir" in texto(), "tem 'Excluir'")
    ok(pag.locator("[data-acao=cancelar]").count() == 1, "tem 'Cancelar'")
    ok(pag.locator("a[href*='/concluir/']").count() >= 1, "tem 'Concluir'")
    url_servico = pag.url

    # ---- Cancelar -> aguardando reagendamento ----
    pag.click("[data-acao=cancelar]"); pag.wait_for_timeout(400)
    pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1200)
    ir("/reagendamentos")
    ok("Cancelado" in texto(), "cancelado aparece em Reagendamentos")
    ir("/")
    ok("reagend" in texto().lower(), "início avisa (lembrete de reagendamento)")
    ir("/reagendamentos")
    ok(pag.locator("a:has-text('Reagendar'), button:has-text('Reagendar')").count() == 0, "não há botão Reagendar")
    pag.locator("a:has-text('Editar')").first.click(); pag.wait_for_timeout(1200)
    ok("/editar" in pag.url, "Reagendar abre a edição")
    ok("estava cancelado" in texto(), "edição avisa que estava cancelado")
    pag.fill("input[name=data]", "2031-06-10"); pag.dispatch_event("input[name=data]", "change"); pag.wait_for_timeout(500)
    pag.fill("input[name=hora]", "10:00"); pag.dispatch_event("input[name=hora]", "change"); pag.wait_for_timeout(500)
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url and "editar" not in pag.url, "salvou o reagendamento")
    ok("Reagendado" in texto() and "aguardando" not in texto().lower(), "ficou 'Reagendado'")

    # ---- Excluir agendamento (admin) ----
    pag.click("[data-acao=excluir]"); pag.wait_for_timeout(400)
    ok("Não apaga o cliente" in pag.inner_text("dialog"), "aviso diz que não apaga cliente nem concluídos")
    pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1500)
    ok("/agenda" in pag.url, "excluir volta para a agenda")

    # ---- Sem aparelho nem serviço repetido no agendamento ----
    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(700)
    pag.click("[data-acao=adicionar-aparelho]"); pag.wait_for_timeout(400)
    pag.locator("dialog [data-escolha]").first.click(); pag.wait_for_timeout(500)
    ok(pag.locator("section.agenda-aparelho").count() == 1, "aparelho entrou no agendamento")
    pag.click("[data-acao=adicionar-servico]"); pag.wait_for_timeout(400)
    opcoes = pag.locator("dialog [data-escolha]")
    total_tipos = opcoes.count()
    primeira = opcoes.first.inner_text().split("·")[0].strip()
    opcoes.first.click(); pag.wait_for_timeout(500)
    pag.click("[data-acao=adicionar-servico]"); pag.wait_for_timeout(400)
    restantes = [t.split("·")[0].strip() for t in pag.locator("dialog [data-escolha]").all_inner_texts()]
    ok(len(restantes) == total_tipos - 1 and primeira not in restantes, f"o mesmo serviço não entra duas vezes no aparelho ({primeira})")
    pag.keyboard.press("Escape"); pag.wait_for_timeout(300)
    for _ in range(5):
        if pag.locator("[data-acao=adicionar-aparelho]").count() == 0: break
        pag.click("[data-acao=adicionar-aparelho]"); pag.wait_for_timeout(400)
        if pag.locator("dialog [data-escolha]").count() == 0: break
        pag.locator("dialog [data-escolha]").first.click(); pag.wait_for_timeout(400)
    ok("Cadastre outro aparelho" in pag.inner_text("body"), "aviso '⚠️ Cadastre outro aparelho.' quando não sobra aparelho")

    ok(len(erros) == 0, f"sem erros de console ({erros})")
    nav.close()
print()
if falhas:
    print(f"{len(falhas)} FALHA(S)"); raise SystemExit(1)
print("Tudo certo.")
