"""
PACOTE 19 (modo demonstração; ajustado no pacote 20): aviso ao cliente pelo WhatsApp.
Depois de agendar, reagendar (mudar dia/hora) e cancelar, o ADMINISTRADOR vê o painel de avisos com o botão "Mensagem para ..."
(link wa.me do cliente com a mensagem pronta; a mensagem vai dentro do link). Editar sem mudar dia/hora não pergunta. Os 3 textos são
editáveis em Configurações (com prévia e "voltar ao padrão").
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote19.py
"""
import datetime
from urllib.parse import unquote
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?demo=1"
SEL = "dialog.seletor"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


def proxima_quarta():
    h = datetime.date.today()
    primeiro = (h.replace(day=1) + datetime.timedelta(days=32)).replace(day=1)
    d = primeiro + datetime.timedelta(days=10)
    while d.weekday() != 2:
        d += datetime.timedelta(days=1)
    return d


with sync_playwright() as p:
    nav = p.chromium.launch()
    pag = nav.new_page(viewport={"width": 390, "height": 844})
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))

    def ir(h):
        pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1000)

    def esperar_folha():
        pag.wait_for_selector(f"{SEL}[open]")
        pag.wait_for_function("!document.querySelector('dialog.seletor')?.innerText.includes('Carregando')", timeout=8000)
        pag.wait_for_timeout(200)

    def aviso_aberto():
        return pag.locator("dialog[open]:not(.seletor)").count() > 0

    def texto_aviso():
        return pag.inner_text("dialog[open]:not(.seletor)")

    def msg_cliente():
        href = pag.locator("dialog[open][data-avisos] a[data-abrir=cliente]").get_attribute("href")
        return unquote(href.split("text=")[1])

    def fechar_aviso():
        pag.locator("dialog[open][data-avisos] [data-fechar]").click(); pag.wait_for_timeout(1200)

    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    # ---------------- Configurações: os 3 avisos ----------------
    ir("/configuracoes")
    for campo, trecho in [("avisoAgendado", "confirmado"), ("avisoCancelado", "cancelado"), ("avisoReagendado", "reagendado")]:
        ok(pag.locator(f"textarea[name={campo}]").count() == 1 and trecho in pag.input_value(f"textarea[name={campo}]"), f"Configurações tem o campo {campo} com o texto padrão")
    previa = pag.inner_text("#previa-agendado")
    ok("Maria" in previa and "16 de novembro" in previa and "07:00" in previa and "{" not in previa, f"prévia do aviso de agendamento: {previa[:70]!r}")
    pag.fill("textarea[name=avisoCancelado]", "Oi {nome}, cancelamos o {servico} de {data} às {hora}. {empresa}"); pag.wait_for_timeout(200)
    ok(pag.inner_text("#previa-cancelado").startswith("Oi Maria, cancelamos o Limpeza de"), "a prévia acompanha o que se digita")
    pag.locator("[data-acao=padrao-aviso][data-tipo=cancelado]").click(); pag.wait_for_timeout(200)
    ok("foi cancelado" in pag.input_value("textarea[name=avisoCancelado]"), "'Voltar ao aviso padrão' restaura o texto")
    pag.fill("textarea[name=avisoCancelado]", "Oi {nome}, cancelamos o {servico} de {data} às {hora}. {empresa}")
    pag.click("#form-config [type=submit]"); pag.wait_for_timeout(1200)
    ir("/configuracoes")
    ok(pag.input_value("textarea[name=avisoCancelado]").startswith("Oi {nome}, cancelamos"), "o texto salvo volta ao abrir Configurações")

    # ---------------- Agendar: aviso de agendamento ----------------
    d = proxima_quarta()
    ir("/agenda"); pag.wait_for_timeout(400)
    for _ in range(6):
        if pag.locator(f"section[aria-label='Calendário'] [data-dia='{d.isoformat()}']").count() > 0:
            break
        pag.click("[data-acao=mes-seguinte]"); pag.wait_for_timeout(700)
    pag.click(f"section[aria-label='Calendário'] [data-dia='{d.isoformat()}']"); pag.wait_for_timeout(300)
    pag.click("#botao-agendar"); esperar_folha()
    pag.click(f"{SEL} [data-acao=seletor-hora][data-hora='09:00']"); pag.click(f"{SEL} [data-acao=seletor-confirmar]"); pag.wait_for_timeout(1200)
    pag.locator("[data-acao=escolher-cliente]", has_text="Maria Souza").click(); pag.wait_for_timeout(700)
    pag.locator("[data-acao=adicionar-aparelho]").first.click(); pag.wait_for_timeout(400)
    pag.locator("dialog [data-escolha]", has_text="Quarto").first.click(); pag.wait_for_timeout(500)
    pag.click("#botao-salvar"); pag.wait_for_timeout(1800)
    ok(aviso_aberto(), "depois de agendar, abre a janela do aviso")
    t = texto_aviso()
    ok("Avisar sobre o agendamento" in t, "título: avisar sobre o agendamento")
    m = msg_cliente()
    ok("Maria" in m and "09:00" in m and f"{d.day} de" in m, f"a mensagem traz nome, dia e hora: {m[:160]!r}")
    href = pag.locator("dialog[open] a[data-abrir=cliente]").get_attribute("href")
    ok(href.startswith("https://wa.me/5511912345678?text="), f"o botão abre o WhatsApp da Maria ({href[:40]})")
    ok(pag.locator("dialog[open] a[data-abrir=cliente]").inner_text().strip() == "Mensagem para Maria", "botão 'Mensagem para Maria'")
    ok("/servico/" not in pag.url, "a tela espera a resposta antes de seguir")
    fechar_aviso()
    ok("/servico/" in pag.url and not aviso_aberto(), "'Fechar' fecha e segue para o agendamento")
    url_servico = pag.url.split("#")[1]

    # ---------------- Editar sem mudar dia/hora: não pergunta ----------------
    ir(f"{url_servico}/editar"); pag.wait_for_selector("#botao-salvar"); pag.wait_for_timeout(600)
    pag.click("#botao-salvar"); pag.wait_for_timeout(1800)
    ok(not aviso_aberto() and "/servico/" in pag.url, "salvar sem mudar dia nem hora não pergunta nada")
    url_servico = pag.url.split("#")[1]  # ao salvar, a tela segue para a linha atual do agendamento

    # ---------------- Mudar a hora: aviso de reagendamento ----------------
    ir(f"{url_servico}/editar")
    try:
        pag.wait_for_selector("#botao-salvar", timeout=6000)
    except Exception:
        print("DEBUG", pag.url, pag.inner_text("body")[:600]); raise
    pag.wait_for_timeout(600)
    pag.click("#botao-quando"); esperar_folha()
    pag.click(f"{SEL} [data-acao=seletor-hora][data-hora='11:00']"); pag.click(f"{SEL} [data-acao=seletor-confirmar]")
    pag.wait_for_selector(SEL, state="detached"); pag.wait_for_timeout(600)
    pag.click("#botao-salvar"); pag.wait_for_timeout(1800)
    ok(aviso_aberto() and "Avisar sobre a nova data" in texto_aviso(), "mudou a hora: oferece o aviso de reagendamento")
    ok("reagendado" in msg_cliente() and "11:00" in msg_cliente(), "a mensagem diz que foi reagendado, com a hora nova")
    fechar_aviso()

    # ---------------- Cancelar: aviso de cancelamento (texto da empresa) ----------------
    pag.click("[data-acao=cancelar]"); pag.wait_for_timeout(400)
    pag.locator("dialog[open] [data-resposta=sim]").click(); pag.wait_for_timeout(1500)
    ok(aviso_aberto() and "Avisar sobre o cancelamento" in texto_aviso(), "depois de cancelar, oferece o aviso de cancelamento")
    ok("Oi Maria, cancelamos o" in msg_cliente() and "11:00" in msg_cliente(), f"usa o texto editado em Configurações: {msg_cliente()[:120]!r}")
    ok("a definir" not in msg_cliente(), "'Serviço a definir' (aparelho sem serviço) não vai na mensagem")
    fechar_aviso()
    ok("#/agenda" in pag.url, "depois do aviso, volta para a Agenda")

    # ---------------- Reagendar o cancelado: aviso de reagendamento ----------------
    ir("/reagendamentos")
    item = pag.locator("a[href^='#/servico/']").first
    if item.count() > 0:
        item.click(); pag.wait_for_timeout(900)
        ok(True, "abriu um agendamento aguardando reagendamento")

    # ---------------- Técnico não vê o aviso ----------------
    ctx2 = nav.new_context(viewport={"width": 390, "height": 844}); tec = ctx2.new_page()
    tec.goto(BASE + "#/entrar"); tec.wait_for_selector("#form-entrar")
    tec.fill("input[name=email]", "tecnico@meutecnico.app"); tec.fill("input[name=senha]", "demo123")
    tec.click("#form-entrar [type=submit]"); tec.wait_for_selector(".menu-topo__item"); tec.wait_for_timeout(1000)
    tec.evaluate("location.hash='#/configuracoes'"); tec.wait_for_timeout(900)
    ok("#/configuracoes" not in tec.url, "técnico não abre Configurações")

    ok(not [e for e in erros if "favicon" not in e], f"sem erros no console: {erros[:3]}")
    nav.close()

print("\nFALHAS:" if falhas else "\nTudo certo.", falhas or "")
raise SystemExit(1 if falhas else 0)
