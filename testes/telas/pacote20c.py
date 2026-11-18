"""
PACOTE 20C (modo demonstração): avanço entre campos nas telas de uso diário.
Enter num campo preenchido vai ao próximo (com o cursor já nele); campo vazio obrigatório não avança;
telefone completo passa sozinho ao próximo campo. Telas: Novo aparelho, Novo funcionário, Configurações.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote20c.py
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


with sync_playwright() as p:
    nav = p.chromium.launch()
    pag = nav.new_page(viewport={"width": 390, "height": 844}); pag.add_init_script(path='testes/telas/sem-aviso.js')
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))

    def ir(h):
        pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1000)

    def foco():
        return pag.evaluate("document.activeElement?.name || document.activeElement?.tagName")

    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    # ---------------- Novo aparelho ----------------
    ir("/cliente/c-maria/aparelho/novo"); pag.wait_for_selector("#form-aparelho"); pag.wait_for_timeout(500)
    pag.select_option("select[name=tipo]", index=1)
    pag.click("input[name=marca]"); pag.keyboard.type("Samsung"); pag.keyboard.press("Enter"); pag.wait_for_timeout(200)
    ok(foco() == "modelo", f"Enter na marca leva o cursor ao modelo (foco: {foco()})")
    pag.keyboard.type("AR12"); pag.keyboard.press("Enter"); pag.wait_for_timeout(200)
    ok(foco() == "numeroSerie", f"Enter no modelo leva ao número de série (foco: {foco()})")
    ok("Samsung" == pag.input_value("input[name=marca]") and "AR12" == pag.input_value("input[name=modelo]"), "o que foi digitado continua nos campos")
    ok("#/cliente/c-maria/aparelho/novo" in pag.url, "continua na tela do aparelho (não salvou por engano)")

    # ---------------- Novo funcionário ----------------
    ir("/equipe/novo"); pag.wait_for_selector("#form-func"); pag.wait_for_timeout(400)
    pag.click("input[name=nome]"); pag.keyboard.press("Enter"); pag.wait_for_timeout(300)
    ok(foco() == "nome", "nome vazio: Enter não avança (mostra o que falta)")
    pag.click("input[name=nome]"); pag.keyboard.type("Fernando Lima"); pag.keyboard.press("Enter"); pag.wait_for_timeout(200)
    ok(foco() == "telefone", f"Enter no nome leva ao WhatsApp (foco: {foco()})")
    pag.keyboard.type("11987651234"); pag.wait_for_timeout(200)
    ok(pag.input_value("input[name=telefone]") == "(11) 98765-1234", "o WhatsApp é formatado ao digitar")

    # ---------------- Configurações ----------------
    ir("/configuracoes"); pag.wait_for_selector("#form-config"); pag.wait_for_timeout(500)
    pag.click("input[name=nome]"); pag.keyboard.press("Enter"); pag.wait_for_timeout(200)
    ok(foco() == "diasAvisoRetorno", f"Enter no nome da empresa leva aos dias do aviso (foco: {foco()})")
    pag.keyboard.press("Enter"); pag.wait_for_timeout(200)
    ok(foco() == "mensagemWhatsapp", f"Enter nos dias leva à mensagem (foco: {foco()})")
    antes = len(pag.input_value("textarea[name=mensagemWhatsapp]"))
    pag.keyboard.press("Enter"); pag.wait_for_timeout(100)
    ok(len(pag.input_value("textarea[name=mensagemWhatsapp]")) == antes + 1 and foco() == "mensagemWhatsapp", "Enter dentro de um texto longo continua sendo quebra de linha")

    ok(not [e for e in erros if "favicon" not in e], f"sem erros no console: {erros[:3]}")
    nav.close()

print("\nFALHAS:" if falhas else "\nTudo certo.", falhas or "")
raise SystemExit(1 if falhas else 0)
