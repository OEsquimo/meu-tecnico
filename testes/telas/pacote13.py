"""
PACOTE 13 (modo demonstração): Ferramentas + link de horários para o cliente + Agendar com pedido do cliente
+ destino depois do login.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote13.py
"""
import re
import urllib.parse
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


def entrar(pag, email):
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)


with sync_playwright() as p:
    nav = p.chromium.launch()
    erros = []

    def nova(ctx_nav=None):
        c = nav.new_context(viewport={"width": 390, "height": 844})
        pg = c.new_page()
        pg.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: erros.append(str(e)))
        return c, pg

    ctx_admin, pag = nova()

    def ir(h):
        pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1000)

    def texto(pg=None):
        return (pg or pag).inner_text("#conteudo")

    entrar(pag, "demo@meutecnico.app")

    # ---------------- Início e lista de Ferramentas ----------------
    ok(pag.locator("a.atalho:has-text('Ferramentas')").count() == 1, "Início do administrador tem o quadrado 'Ferramentas'")
    pag.locator("a.atalho:has-text('Ferramentas')").click(); pag.wait_for_timeout(800)
    ok("#/ferramentas" in pag.url and "Enviar horários ao cliente" in texto(), "Ferramentas lista 'Enviar horários ao cliente'")
    pag.locator("a.ferramenta").first.click(); pag.wait_for_timeout(1000)

    # ---------------- Sem WhatsApp do administrador: pede ----------------
    ok("Falta o seu WhatsApp" in texto(), "sem WhatsApp cadastrado, a ferramenta pede o número")
    pag.fill("input[name=telefone]", "123"); pag.click("#form-whatsapp [type=submit]"); pag.wait_for_timeout(500)
    ok("Número inválido" in pag.inner_text("body"), "número inválido mostra erro")
    pag.fill("input[name=telefone]", "81983259341"); pag.click("#form-whatsapp [type=submit]"); pag.wait_for_timeout(1500)
    ok(pag.locator("#mensagem-previa").count() == 1, "depois de salvar o WhatsApp, a mensagem aparece")
    ir("/equipe/eu")
    ok("98325-9341" in pag.input_value("input[name=telefone]"), "o WhatsApp ficou salvo em Meus dados")
    ir("/ferramentas/horarios")

    # ---------------- A ferramenta ----------------
    previa = pag.inner_text("#mensagem-previa")
    ok("Olá! Aqui é da" in previa and "#/horarios?" in previa, "mensagem pronta com o link")
    ok("dias com horário livre" in pag.inner_text("#resumo-previa") and "(81) 98325-9341" in pag.inner_text("#resumo-previa"), "resumo mostra dias livres e o WhatsApp que receberá o pedido")
    href = pag.get_attribute("#enviar-whatsapp", "href")
    ok(href.startswith("https://wa.me/?text="), "'Enviar pelo WhatsApp' abre a lista de contatos (sem número)")
    ok(pag.locator("[data-acao=copiar-mensagem]").count() == 1, "botão 'Copiar mensagem'")
    resumo1 = pag.inner_text("#resumo-previa")
    pag.locator("label.chip", has_text="Instalação").click(); pag.wait_for_timeout(500)
    ok(pag.inner_text("#resumo-previa") != resumo1, "trocar o serviço recalcula os horários")
    ok("Atendimento" not in pag.inner_text("#mensagem-previa"), "serviço não aparece escrito na mensagem do administrador")
    link = re.search(r"https?://\S+#/horarios\?\S+", pag.inner_text("#mensagem-previa")).group(0)
    ok("s=Instala" in urllib.parse.unquote_plus(link), "o serviço escolhido vai no link")
    ok("?demo=1#/horarios" in link, "o link mantém o ?demo=1 (senão abriria 'aplicativo não configurado')")

    # ---------------- O cliente abre o link (sem login) ----------------
    ctx_cli, cli = nova()
    cli.goto(link); cli.wait_for_selector(".pagina-cliente", timeout=8000); cli.wait_for_timeout(500)
    ok("não está configurado" not in cli.inner_text("body"), "o link abre a página do cliente (não a tela de 'não configurado')")
    t = texto(cli)
    ok("Escolha o melhor dia e horário" in t and "Atendimento: Instalação" in t, "página do cliente com título e serviço")
    ok(cli.locator(".menu-topo__item").count() == 0 or not cli.locator("#menu-topo").is_visible(), "página pública sem menu")
    ok(cli.locator("#passo-horario").is_hidden() and cli.locator("#passo-dados").is_hidden(), "só o passo 1 aparece no começo")
    dia = cli.locator("[data-acao=dia]:not([disabled])").first
    iso = dia.get_attribute("data-iso")
    dia.click(); cli.wait_for_timeout(400)
    ok(cli.locator("#passo-horario").is_visible() and cli.locator("[data-acao=hora]").count() > 0, "ao escolher o dia aparecem os horários")
    ok(cli.locator(".horarios-grupo__titulo").first.inner_text().lower() in ("manhã", "tarde"), "horários separados em Manhã/Tarde")
    cli.locator("[data-acao=hora]").first.click(); cli.wait_for_timeout(400)
    hora = cli.locator("[data-acao=hora].horario-botao--escolhido").inner_text()
    ok(cli.locator("#passo-dados").is_visible(), "ao escolher o horário aparecem os dados")
    cli.click("#form-pedido [type=submit]"); cli.wait_for_timeout(400)
    ok("Digite o seu nome" in cli.inner_text("body"), "nome vazio mostra erro")
    cli.fill("input[name=nome]", "Cláudia Nogueira"); cli.fill("input[name=whatsapp]", "123")
    cli.click("#form-pedido [type=submit]"); cli.wait_for_timeout(400)
    ok("Número inválido" in cli.inner_text("body"), "WhatsApp preenchido errado mostra erro")
    cli.fill("input[name=whatsapp]", "")
    cli.click("#form-pedido [type=submit]"); cli.wait_for_timeout(600)
    ok("Quase lá" in texto(cli) and "Cláudia Nogueira" in texto(cli), "WhatsApp é opcional: segue para 'Quase lá'")
    ok("agendad" not in texto(cli).lower().replace("agendamento", ""), "a página não promete agendamento")
    zap = urllib.parse.unquote(cli.get_attribute("#enviar-pedido", "href"))
    ok(zap.startswith("https://wa.me/5581983259341?text="), "o pedido vai para o WhatsApp do administrador")
    ok("Cláudia Nogueira" in zap and "Técnico: abrir no app" in zap and "#/agendar?" in zap, "mensagem do pedido tem o nome e o botão do técnico")
    link_app = re.search(r"https?://\S+#/agendar\?\S+", zap).group(0)
    ok("?demo=1#/agendar" in link_app, "o botão 'Técnico: abrir no app' também mantém o ?demo=1")
    cli.click("[data-acao=mudar]"); cli.wait_for_timeout(800)
    ok(cli.locator("#passo-horario").is_hidden(), "'Mudar o dia ou o horário' volta ao começo")

    # ---------------- Links com problema ----------------
    cli.goto(BASE + "#/horarios"); cli.wait_for_selector(".pagina-cliente"); cli.reload(); cli.wait_for_selector(".pagina-cliente")
    ok("Link incompleto" in texto(cli), "link sem dados: 'Link incompleto'")
    cli.goto(BASE + "#/horarios?e=Frio&w=5581983259341&g=2020-01-01&p=0_bo_1"); cli.reload(); cli.wait_for_selector(".pagina-cliente")
    ok("Este link venceu" in texto(cli) and cli.locator("a:has-text('Falar com o técnico')").count() == 1, "link vencido: explica e oferece o WhatsApp")

    # ---------------- Técnico não vê nem abre a ferramenta ----------------
    ctx_tec, tec = nova()
    entrar(tec, "tecnico@meutecnico.app")
    ok(tec.locator("a.atalho:has-text('Ferramentas')").count() == 0, "técnico não vê o quadrado 'Ferramentas'")
    tec.evaluate("location.hash='#/ferramentas/horarios'"); tec.wait_for_timeout(1000)
    ok("#/ferramentas/horarios" not in tec.url, "técnico não abre a ferramenta do administrador")

    # ---------------- Agendar com o pedido do cliente ----------------
    ir("/agenda")
    pag.evaluate("location.hash='#" + link_app.split('#', 1)[1] + "'"); pag.wait_for_selector("#form-agendar", timeout=8000); pag.wait_for_timeout(1200)
    t = texto()
    ok("Pedido do cliente" in t and "Cláudia Nogueira" in t, "Agendar mostra o aviso 'Pedido do cliente'")
    quando = pag.inner_text("#botao-quando")
    ok(hora in quando, f"dia e hora do pedido já vêm preenchidos ({quando.splitlines()[0]})")
    ok(pag.locator("#campo-busca").count() == 0 and "Cadastrar cliente novo" in t and "Buscar cliente já cadastrado" in t, "pedido de cliente: dois botões, sem busca nem lista de nomes na cara")
    pag.locator("[data-acao=buscar-cliente-pedido]").click(); pag.wait_for_timeout(500)
    ok(pag.input_value("#campo-busca") == "Cláudia Nogueira", "'Buscar cliente já cadastrado' abre a busca já com o nome")
    ok("Cadastrar cliente novo" in pag.inner_text("#area-cliente"), "sem resultado, a busca ainda oferece cadastrar")
    ir("/agenda")
    ir("/agendar?" + link_app.split("#/agendar?", 1)[1])
    pag.locator("a:has-text('Cadastrar cliente novo')").click(); pag.wait_for_timeout(1000)
    ok(pag.input_value("input[name=nome]") == "Cláudia Nogueira", "cadastro novo vem com o nome do pedido")
    pag.locator("label.chip", has_text="Digitar à mão").first.click()
    for n, v in [("rua", "Rua A"), ("numero", "10"), ("cidade", "Recife")]:
        pag.locator(f"input[name$={n}]:visible").first.fill(v)
    pag.fill("input[name=whatsapp]", "81983259341")
    pag.click("#form-cliente [type=submit]"); pag.wait_for_selector("#form-agendar", timeout=8000); pag.wait_for_timeout(1000)
    ok("#/agendar" in pag.url and "Pedido do cliente" in texto() and "Cláudia Nogueira" in pag.inner_text("#area-cliente"), "depois do cadastro volta ao Agendar com o pedido e o cliente")
    ok(hora in pag.inner_text("#botao-quando"), "dia e hora continuam no pedido")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok("#/agendar" not in pag.url, "Agendar salva o pedido sem aparelho e sem serviço")
    ir("/agenda")
    ir("/clientes")
    ok("Cláudia Nogueira" in texto(), "o cliente novo está na lista")

    # cliente já cadastrado: achado pelo WhatsApp
    q = urllib.parse.urlencode({"pedido": "1", "data": iso, "hora": hora, "nome": "Ana", "whatsapp": "11934567890"})
    ir("/agendar?" + q)
    ok("Ana Lima" in pag.inner_text("#area-cliente") and pag.locator("[data-acao=buscar-cliente-pedido]").count() == 0, "cliente já cadastrado é escolhido pelo WhatsApp")
    q2 = urllib.parse.urlencode({"pedido": "1", "data": iso, "hora": hora, "nome": "Ana"})
    ir("/agendar?" + q2)
    pag.locator("[data-acao=buscar-cliente-pedido]").click(); pag.wait_for_timeout(500)
    ok("Ana Lima" in pag.inner_text("#area-resultados"), "'Buscar cliente' lista os cadastrados com o nome do pedido")
    pag.locator("[data-acao=escolher-cliente]").first.click(); pag.wait_for_timeout(500)
    ok("Ana Lima" in pag.inner_text("#area-cliente") and "Pedido do cliente" in texto(), "tocar no cliente da lista escolhe ele e mantém o pedido")

    # horário que já passou
    q = urllib.parse.urlencode({"pedido": "1", "data": "2020-01-01", "hora": "09:00", "nome": "Zé"})
    ir("/agendar?" + q)
    ok("já não está livre" in texto() and "Escolher dia e horário" in pag.inner_text("#botao-quando"), "horário que já passou: avisa e deixa escolher outro")

    # pedido mexido/sem pedido=1 não mostra o aviso
    ir("/agendar?data=" + iso + "&hora=09:00")
    ok("Pedido do cliente" not in texto(), "sem pedido=1 o Agendar funciona como sempre")

    # ---------------- Destino depois do login ----------------
    q = urllib.parse.urlencode({"pedido": "1", "data": iso, "hora": hora, "nome": "Joana Dias", "whatsapp": "81988887777"})
    ctx_v, vis = nova()
    vis.goto(BASE + "#/agendar?" + q); vis.wait_for_selector("#form-entrar", timeout=8000)
    ok("#/entrar" in vis.url, "visitante que toca no link do técnico cai no login")
    vis.fill("input[name=email]", "demo@meutecnico.app"); vis.fill("input[name=senha]", "demo123")
    vis.click("#form-entrar [type=submit]"); vis.wait_for_selector("#form-agendar", timeout=10000); vis.wait_for_timeout(800)
    ok("#/agendar" in vis.url and "Joana Dias" in vis.inner_text("#conteudo"), "depois do login o administrador vai direto ao pedido")

    ctx_v2, vis2 = nova()
    vis2.goto(BASE + "#/agendar?" + q); vis2.wait_for_selector("#form-entrar", timeout=8000)
    vis2.fill("input[name=email]", "tecnico@meutecnico.app"); vis2.fill("input[name=senha]", "demo123")
    vis2.click("#form-entrar [type=submit]"); vis2.wait_for_selector(".menu-topo__item", timeout=10000); vis2.wait_for_timeout(1000)
    ok("#/agendar" not in vis2.url, "técnico que entra pelo mesmo link vai para o Início (não abre o Agendar)")

    # Login normal continua indo para o Início
    ctx_n, norm = nova()
    entrar(norm, "demo@meutecnico.app")
    ok(norm.url.endswith("#/") or "#/" == norm.url.split("#", 1)[1], "login normal continua indo para o Início")

    ok(not [e for e in erros if "favicon" not in e], f"sem erros no console ({[e for e in erros][:3]})")
    nav.close()

print("\nFALHAS:", falhas if falhas else "nenhuma")
raise SystemExit(1 if falhas else 0)
