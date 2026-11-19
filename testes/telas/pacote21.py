"""
PACOTE 21 (modo demonstração): Financeiro sem "Por técnico", "Conta/Sair" do técnico, editar técnico com convite
pendente, atualização automática da tela do técnico e avanço entre campos nas demais telas.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote21.py
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


def entrar(nav, email):
    pag = nav.new_page(viewport={"width": 390, "height": 844}); pag.add_init_script(path='testes/telas/sem-aviso.js')
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)
    return pag, erros


with sync_playwright() as p:
    nav = p.chromium.launch()

    # ---------------- Administrador ----------------
    pag, erros = entrar(nav, "demo@meutecnico.app")

    def ir(h):
        pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1000)

    def foco():
        return pag.evaluate("document.activeElement?.name || document.activeElement?.tagName")

    ir("/financeiro")
    t = pag.inner_text("#conteudo")
    ok("Por técnico" not in t and "Recebido" in t, "Financeiro não tem mais o card 'Por técnico'")
    ok("Por tipo de serviço" in t or "Nenhum serviço concluído" in t, "o resto do Financeiro continua (por tipo de serviço)")
    menu_admin = pag.inner_text(".menu-topo")
    ok("Conta" not in menu_admin, "o menu do administrador não ganhou item novo")

    # Convite pendente: editar nome e WhatsApp
    ir("/equipe/novo")
    pag.fill("input[name=nome]", "Teste Silva"); pag.fill("input[name=telefone]", "11912345678")
    pag.click("#form-func [type=submit]"); pag.wait_for_timeout(1000)
    ok("equipe/convite" in pag.url, "criar convite leva à tela do link")
    url_convite = pag.url.split("#")[1]
    ok(pag.locator("a:has-text('Editar dados')").count() == 1, "o convite tem o botão 'Editar dados'")
    pag.locator("a:has-text('Editar dados')").click(); pag.wait_for_timeout(900)
    ok("?editar=1" in pag.url and pag.locator("#form-func").count() == 1, "abre o formulário de edição do funcionário convidado")
    ok(pag.locator("[data-acao=bloqueio]").count() == 0 and pag.locator("[data-acao=remover]").count() == 0, "sem Bloquear nem Remover enquanto o convite está pendente")
    ok(pag.locator("input[name=nome]").input_value() == "Teste Silva", "os dados atuais vêm preenchidos")
    pag.fill("input[name=nome]", "Teste Souza"); pag.fill("input[name=telefone]", "11987654321")
    pag.click("#form-func [type=submit]"); pag.wait_for_timeout(1000)
    ok(url_convite in pag.url, "salvar volta para a tela do convite")
    ok("Teste Souza" in pag.inner_text("#conteudo"), "o convite mostra o nome novo")
    ir("/equipe/convite/inexistente"); pag.wait_for_timeout(300)
    ir("/equipe"); ok("Teste Souza" in pag.inner_text("#conteudo"), "a lista da Equipe mostra o nome novo")
    # Funcionário ativo continua com Bloquear e Remover
    ir("/equipe/eq-rafael")
    ok(pag.locator("[data-acao=bloqueio]").count() == 1 and pag.locator("[data-acao=remover]").count() == 1, "técnico ativo continua com Bloquear e Remover")
    # Entrar em /equipe/<convite> sem ?editar volta para o convite
    ir(url_convite.replace("/convite", ""))
    ok("equipe/convite" in pag.url, "abrir o convite pelo endereço do funcionário continua levando ao convite")

    # Avanço entre campos nas demais telas
    ir("/tipos-servico/novo"); pag.wait_for_selector("#form-tipo")
    pag.click("#form-tipo input[name=nome]"); pag.keyboard.type("Teste"); pag.keyboard.press("Enter"); pag.wait_for_timeout(200)
    ok(foco() != "nome", f"Tipo de serviço: Enter no nome leva ao campo seguinte (foco: {foco()})")
    ir("/horario"); pag.wait_for_timeout(300)
    ok(not [e for e in erros if "favicon" not in e], f"administrador sem erros no console: {erros[:3]}")
    pag.context.close()

    # ---------------- Técnico ----------------
    tec, erros_t = entrar(nav, "tecnico@meutecnico.app")
    menu = tec.inner_text(".menu-topo")
    ok("Conta" in menu, "o menu do técnico tem 'Conta'")
    tec.locator(".menu-topo__item", has_text="Conta").click(); tec.wait_for_timeout(900)
    ok("#/conta" in tec.url and tec.locator("[data-acao=sair]").count() == 1, "Conta mostra o botão Sair")
    tec.locator(".menu-topo__item", has_text="Meus serviços").click(); tec.wait_for_timeout(900)

    # Atualização automática: ao voltar para o app, a tela é redesenhada sem piscar e sem perder a rolagem
    tec.wait_for_timeout(21000)
    tec.evaluate("document.querySelector('#conteudo').firstElementChild.setAttribute('data-marca','1')")
    tec.evaluate("window.dispatchEvent(new Event('focus'))"); tec.wait_for_timeout(1500)
    ok(tec.evaluate("document.querySelector('#conteudo [data-marca]') === null"), "ao voltar para o app a tela do técnico foi atualizada (redesenhada)")
    ok(tec.locator(".esqueleto").count() == 0, "a atualização não mostra o esqueleto de carregamento")
    ok("Meus serviços" in tec.inner_text(".menu-topo") and tec.locator("#conteudo").inner_text().strip() != "", "a tela continua com conteúdo")

    # Com janela aberta, não atualiza
    tec.wait_for_timeout(21000)
    tec.evaluate("""() => { const d = document.createElement('dialog'); d.id = 'dlg-teste'; d.innerHTML = '<p>aberto</p>'; document.body.appendChild(d); d.showModal(); }""")
    tec.evaluate("document.querySelector('#conteudo').firstElementChild.setAttribute('data-marca','2')")
    tec.evaluate("window.dispatchEvent(new Event('focus'))"); tec.wait_for_timeout(1200)
    ok(tec.evaluate("document.querySelector('#conteudo [data-marca]') !== null"), "com uma janela aberta a tela NÃO é atualizada")
    tec.evaluate("document.getElementById('dlg-teste').remove()")

    # Sair
    tec.locator(".menu-topo__item", has_text="Conta").click(); tec.wait_for_timeout(700)
    tec.locator("[data-acao=sair]").click(); tec.wait_for_timeout(1500)
    ok("#/entrar" in tec.url or tec.locator("#form-entrar").count() == 1, "Sair leva de volta ao login")
    ok(not [e for e in erros_t if "favicon" not in e], f"técnico sem erros no console: {erros_t[:3]}")
    nav.close()

print("\nFALHAS:" if falhas else "\nTudo certo.", falhas or "")
raise SystemExit(1 if falhas else 0)
