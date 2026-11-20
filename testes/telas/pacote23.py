"""
PACOTE 23 (modo demonstração):
 A) Botão do "Serviço a definir": sem aparelho = "Informar aparelho e serviço"; com aparelho = "Informar o serviço"
    (não pergunta o aparelho; só oferece o que o aparelho ainda não tem).
 B) Página do cliente (link de horários): WhatsApp e endereço obrigatórios, referência opcional, botão
    "Usar minha localização" com a pergunta "Você está no local?".
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote23.py
"""
import re
import urllib.parse
from playwright.sync_api import sync_playwright
from _quando import escolher_quando

BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, permissions=["geolocation"], geolocation={"latitude": -8.05, "longitude": -34.9})
    # Nominatim falso (sem internet): devolve um endereço sem número
    ctx.route("**/reverse?**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"lat":"-8.05","lon":"-34.9","address":{"road":"Rua das Flores","suburb":"Boa Viagem","city":"Recife","ISO3166-2-lvl4":"BR-PE"}}'))
    ctx.add_init_script(path='testes/telas/sem-aviso.js')
    pag = ctx.new_page()
    erros = []
    pag.on("pageerror", lambda e: erros.append(str(e)))
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    # ---------------- B) Página do cliente ----------------
    pag.evaluate("location.hash='#/ferramentas/horarios'"); pag.wait_for_timeout(1500)
    if pag.locator("#form-whatsapp").count():
        pag.fill("input[name=telefone]", "81983259341"); pag.click("#form-whatsapp [type=submit]"); pag.wait_for_timeout(1500)
    link = re.search(r"https?://\S+#/horarios\?\S+", pag.inner_text("#mensagem-previa")).group(0)
    ctx2 = nav.new_context(viewport={"width": 390, "height": 844}, permissions=["geolocation"], geolocation={"latitude": -8.05, "longitude": -34.9})
    ctx2.route("**/reverse?**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"lat":"-8.05","lon":"-34.9","address":{"road":"Rua das Flores","suburb":"Boa Viagem","city":"Recife","ISO3166-2-lvl4":"BR-PE"}}'))
    cli = ctx2.new_page()
    cli.on("pageerror", lambda e: erros.append(str(e)))
    cli.goto(link); cli.wait_for_selector("#area-calendario"); cli.wait_for_timeout(500)
    cli.locator("[data-acao=dia]:not([disabled])").first.click(); cli.wait_for_timeout(300)
    cli.locator("[data-acao=hora]").first.click(); cli.wait_for_timeout(400)
    ok(cli.locator("button:has-text('Usar minha localização')").count() == 1, "a página tem o botão 'Usar minha localização'")
    ok(cli.locator("input[name=referencia]").count() == 1 and cli.locator("input[name=rua]").count() == 1, "campos de endereço e referência")
    # Não: o botão some e o endereço é à mão
    cli.click("button:has-text('Usar minha localização')"); cli.wait_for_timeout(400)
    ok("Você está no local do atendimento?" in cli.inner_text("dialog[open]"), "pergunta se está no local")
    cli.click("dialog[open] [data-escolha=nao]"); cli.wait_for_timeout(400)
    ok(cli.locator("button:has-text('Usar minha localização')").count() == 0, "respondeu Não: o botão some")
    ok(cli.locator("input[name=rua]").is_visible(), "o endereço continua para preencher à mão")
    cli.reload(); cli.wait_for_selector("#area-calendario")
    cli.locator("[data-acao=dia]:not([disabled])").first.click(); cli.wait_for_timeout(300)
    cli.locator("[data-acao=hora]").first.click(); cli.wait_for_timeout(400)
    # Sim: preenche pelo GPS (o número fica para o cliente)
    cli.click("button:has-text('Usar minha localização')"); cli.wait_for_timeout(300)
    cli.click("dialog[open] [data-escolha=sim]"); cli.wait_for_timeout(1500)
    ok(cli.input_value("input[name=rua]") == "Rua das Flores" and cli.input_value("input[name=cidade]") == "Recife" and cli.input_value("input[name=uf]") == "PE", "Sim: a localização preenche rua, cidade e estado")
    ok(cli.input_value("input[name=numero]") == "", "o número fica para o cliente digitar")
    cli.fill("input[name=nome]", "Cláudia Nogueira"); cli.fill("input[name=whatsapp]", "81 99999-1234")
    cli.click("#form-pedido [type=submit]"); cli.wait_for_timeout(400)
    ok("Informe o número" in cli.inner_text("body"), "sem número não envia")
    cli.fill("input[name=numero]", "120"); cli.fill("input[name=referencia]", "portão azul")
    cli.click("#form-pedido [type=submit]"); cli.wait_for_timeout(600)
    zap = urllib.parse.unquote(cli.get_attribute("#enviar-pedido", "href"))
    ok("📍 Rua das Flores, 120 · Boa Viagem · Recife/PE" in zap and "📌 Referência: portão azul" in zap, "a mensagem leva endereço e referência")
    ok("google.com/maps?q=-8.05,-34.9" in zap, "veio do GPS: a mensagem leva o link do mapa")
    link_app = re.search(r"https?://\S+#/agendar\?\S+", zap).group(0)

    # Mexeu na rua depois do GPS: sem link de mapa
    cli.click("[data-acao=mudar]"); cli.wait_for_timeout(800)
    cli.locator("[data-acao=dia]:not([disabled])").first.click(); cli.wait_for_timeout(300)
    cli.locator("[data-acao=hora]").first.click(); cli.wait_for_timeout(400)
    cli.click("button:has-text('Usar minha localização')"); cli.wait_for_timeout(300)
    cli.click("dialog[open] [data-escolha=sim]"); cli.wait_for_timeout(1500)
    cli.fill("input[name=nome]", "Cláudia"); cli.fill("input[name=whatsapp]", "81 99999-1234"); cli.fill("input[name=numero]", "5")
    cli.fill("input[name=rua]", "Avenida Outra")
    cli.click("#form-pedido [type=submit]"); cli.wait_for_timeout(600)
    zap2 = urllib.parse.unquote(cli.get_attribute("#enviar-pedido", "href"))
    ok("Avenida Outra" in zap2 and "google.com/maps" not in zap2, "mudou a rua depois do GPS: o ponto do mapa sai da mensagem")

    # Administrador abre o pedido: o aviso e o cadastro novo vêm com o endereço
    pag.goto(link_app); pag.wait_for_timeout(2500)
    t = pag.inner_text("body")
    ok("Rua das Flores, 120" in t and "portão azul" in t, "Agendar mostra o endereço e a referência do pedido")
    pag.click("button:has-text('Cadastrar cliente novo'), a:has-text('Cadastrar cliente novo')"); pag.wait_for_timeout(1200)
    ok(pag.input_value("input[name=end1_rua]") == "Rua das Flores" and pag.input_value("input[name=end1_numero]") == "120" and pag.input_value("input[name=end1_cidade]") == "Recife", "cadastro novo vem com o endereço do pedido")
    ok("portão azul" in pag.input_value("textarea[name=observacoes]"), "a referência vai para as observações do cliente")

    # ---------------- A) Botão "Informar o serviço" ----------------
    def ir(h): pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(900)
    # Sem aparelho: continua "Informar aparelho e serviço"
    ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(600)
    escolher_quando(pag, "2031-04-10", "09:00")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok(pag.locator("button:has-text('Informar aparelho e serviço')").count() == 1 and pag.locator("button:has-text('Informar o serviço')").count() == 0, "sem aparelho: o botão é 'Informar aparelho e serviço'")
    # Com aparelho e sem serviço: "Informar o serviço", sem perguntar o aparelho
    ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Maria Souza").click(); pag.wait_for_timeout(800)
    pag.click("[data-acao=adicionar-aparelho]"); pag.wait_for_timeout(500)
    pag.locator("dialog[open] [data-escolha]", has_text="Quarto").click(); pag.wait_for_timeout(600)
    escolher_quando(pag, "2031-04-11", "09:00")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url, "agendamento com aparelho e sem serviço criado")
    ok(pag.locator("button:has-text('Informar o serviço')").count() == 1 and pag.locator("button:has-text('Informar aparelho e serviço')").count() == 0, "com aparelho: o botão é 'Informar o serviço'")
    pag.click("button:has-text('Informar o serviço')"); pag.wait_for_timeout(700)
    janela = pag.inner_text("dialog[open]")
    ok("Qual serviço?" in janela and "Qual aparelho?" not in janela, "não pergunta o aparelho: vai direto ao serviço")
    pag.locator("dialog[open] [data-escolha]").first.click(); pag.wait_for_timeout(1500)
    ok(pag.locator("button:has-text('Informar o serviço')").count() == 0 and pag.locator("a:has-text('Concluir serviço')").count() == 1, "depois de informar, o botão vira 'Concluir serviço'")
    ok("Serviço a definir" not in pag.inner_text("#conteudo"), "a linha 'Serviço a definir' foi preenchida")

    ok(not erros, f"sem erros de JavaScript ({erros[:2]})")
    nav.close()

print("\nFALHAS:", len(falhas))
raise SystemExit(1 if falhas else 0)
