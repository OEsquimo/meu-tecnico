"""
PACOTE 25 (modo demonstração com links curtos: ?demo=1&curtos=1):
 A) Enviar horários gera o link CURTO (#/h/código) e a página do cliente abre por ele.
 B) O pedido do cliente vira link curto (#/p/código); o administrador abre e cai no Agendar preenchido.
 C) Tocar no aviso "Pedido do cliente" coloca os serviços pedidos SEM aparelho; salvar; "Informar o aparelho"; só então conclui.
 D) Links inexistentes mostram aviso claro.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote25.py
"""
import re
import urllib.parse
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1&curtos=1"
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

    def ir(h):
        pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1200)

    # A) link curto de horários
    ir("/ferramentas/horarios")
    if pag.locator("#form-whatsapp").count():
        pag.fill("input[name=telefone]", "81983259341"); pag.click("#form-whatsapp [type=submit]"); pag.wait_for_timeout(1500)
    pag.wait_for_selector("#mensagem-previa")
    msg = pag.inner_text("#mensagem-previa")
    achado = re.search(r"#/h/([a-z0-9]{10})", msg)
    ok(achado is not None, "a mensagem leva o link curto #/h/código")
    ok("#/horarios?" not in msg and len(msg) < 400, f"a mensagem não tem mais o link comprido ({len(msg)} letras)")
    codigo = achado.group(1)
    ir(f"/h/{codigo}")
    pag.wait_for_selector("#area-calendario"); pag.wait_for_timeout(400)
    ok("Qual serviço você precisa?" in pag.inner_text("body"), "o cliente abre pelo link curto e vê os serviços")
    chips = pag.locator("#area-servicos label.chip")
    chips.filter(has_text="Limpeza").click(); pag.wait_for_timeout(150)
    pag.locator("[data-acao=dia]:not([disabled])").first.click(); pag.wait_for_timeout(300)
    pag.locator("[data-acao=hora]").first.click(); pag.wait_for_timeout(400)
    pag.fill("input[name=nome]", "Cláudia Nogueira"); pag.fill("input[name=whatsapp]", "81 99999-1234")
    pag.fill("input[name=rua]", "Rua A"); pag.fill("input[name=numero]", "10"); pag.fill("input[name=cidade]", "Recife")
    pag.click("#form-pedido [type=submit]"); pag.wait_for_timeout(900)
    zap = urllib.parse.unquote(pag.get_attribute("#enviar-pedido", "href"))

    # B) link curto do pedido
    achado_p = re.search(r"#/p/([a-z0-9]{10})", zap)
    ok(achado_p is not None and "#/agendar?" not in zap, "o pedido leva o link curto #/p/código")
    ok("— Técnico: abrir no app\n\nhttp" in zap, "o link do app continua separado por uma linha em branco")
    ir(f"/p/{achado_p.group(1)}")
    pag.wait_for_selector("#area-pedido")
    ok("/agendar" in pag.url and "Pedido do cliente" in pag.inner_text("body"), "o link curto do pedido abre o Agendar com o aviso do pedido")
    ok("Serviços pedidos: Limpeza" in pag.inner_text("body"), "o aviso mostra os serviços pedidos")

    # C) tocar no aviso
    pag.locator("#area-pedido [data-acao=usar-pedido]").first.click(); pag.wait_for_timeout(500)
    ok("Sem aparelho cadastrado" not in pag.inner_text("#conteudo"), "sem cliente escolhido, nada é colocado ainda")
    pag.click("[data-acao=buscar-cliente-pedido]"); pag.wait_for_timeout(400)
    pag.fill("#campo-busca", "Ana"); pag.wait_for_timeout(600)
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(900)
    pag.locator("#area-pedido button[data-acao=usar-pedido]").click(); pag.wait_for_timeout(700)
    ok("Sem aparelho cadastrado" in pag.inner_text("#conteudo") and "Limpeza" in pag.inner_text("#conteudo"), "com cliente, o aviso coloca o serviço pedido, sem aparelho")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1800)
    ok("/servico/" in pag.url, "agendamento salvo mesmo sem aparelho")
    ok(pag.locator("button:has-text('Informar o aparelho')").count() == 1, "a página do agendamento mostra 'Informar o aparelho'")
    ok(pag.locator("a:has-text('Concluir serviço')").count() == 0, "enquanto não tem aparelho, não conclui")
    pag.click("button:has-text('Informar o aparelho')"); pag.wait_for_timeout(700)
    janela = pag.inner_text("dialog[open]")
    ok("Em qual aparelho?" in janela and "Cadastrar aparelho novo" in janela, "pergunta só o aparelho (com opção de cadastrar um novo)")
    # Aparelho que já tem outro agendamento aberto é recusado (regra de sempre): tenta o próximo até achar um livre.
    for i in range(3):
        pag.locator("dialog[open] [data-escolha]:not([data-escolha=''])").nth(i).click(); pag.wait_for_timeout(1500)
        if pag.locator("button:has-text('Informar o aparelho')").count() == 0:
            break
        pag.click("button:has-text('Informar o aparelho')"); pag.wait_for_timeout(700)
    ok(pag.locator("button:has-text('Informar o aparelho')").count() == 0 and pag.locator("a:has-text('Concluir serviço')").count() == 1, "depois de informar o aparelho, aparece 'Concluir serviço'")

    # D) links que não existem
    ir("/p/aaaaaaaaaa")
    ok("Pedido não encontrado" in pag.inner_text("body"), "pedido inexistente: aviso claro")
    ir("/h/zzzzzzzzzz")
    ok("Este link venceu" in pag.inner_text("body"), "link de horários inexistente: aviso claro")

    ok(not erros, f"sem erros de JavaScript ({erros[:2]})")
    nav.close()

print("\nFALHAS:", len(falhas))
raise SystemExit(1 if falhas else 0)
