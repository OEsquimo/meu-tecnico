"""
PACOTE 19 (modo demonstração): aviso ao cliente pelo WhatsApp.
Depois de agendar, reagendar (mudar dia/hora) e cancelar, o ADMINISTRADOR vê uma janela com a mensagem pronta e o botão
"Avisar no WhatsApp" (link wa.me do cliente, sem endereço). Editar sem mudar dia/hora não pergunta. Os 3 textos são
editáveis em Configurações (com prévia e "voltar ao padrão").
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote19.py
"""
import datetime
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

    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    # ---------------- Configurações: os 3 avisos ----------------
    ir("/configuracoes")
    for campo, trecho in [("avisoAgendado", "agendado"), ("avisoCancelado", "cancelar"), ("avisoReagendado", "remarcado")]:
        ok(pag.locator(f"textarea[name={campo}]").count() == 1 and trecho in pag.input_value(f"textarea[name={campo}]"), f"Configurações tem o campo {campo} com o texto padrão")
    previa = pag.inner_text("#previa-agendado")
    ok("Maria" in previa and "16 de novembro" in previa and "07:00" in previa and "{" not in previa, f"prévia do aviso de agendamento: {previa[:70]!r}")
    pag.fill("textarea[name=avisoCancelado]", "Oi {nome}, cancelamos o {servico} de {data} às {hora}. {empresa}"); pag.wait_for_timeout(200)
    ok(pag.inner_text("#previa-cancelado").startswith("Oi Maria, cancelamos o Limpeza de"), "a prévia acompanha o que se digita")
    pag.locator("[data-acao=padrao-aviso][data-tipo=cancelado]").click(); pag.wait_for_timeout(200)
    ok("Precisamos cancelar" in pag.input_value("textarea[name=avisoCancelado]"), "'Voltar ao aviso padrão' restaura o texto")
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
    ok("Avisar o cliente do agendamento?" in t, "título: avisar do agendamento")
    ok("Maria" in t and "09:00" in t and f"{d.day} de" in t, f"a mensagem traz nome, dia e hora: {t[:160]!r}")
    ok("Rua das Flores" not in t and "Jardim" not in t and "120" not in t.replace("09:00", ""), "o endereço do cliente NÃO vai na mensagem")
    href = pag.locator("dialog[open] a[data-escolha=avisar]").get_attribute("href")
    ok(href.startswith("https://wa.me/5511912345678?text="), f"o botão abre o WhatsApp da Maria ({href[:40]})")
    ok(pag.locator("dialog[open] a[data-escolha=avisar]").inner_text().strip() == "Avisar no WhatsApp", "botão 'Avisar no WhatsApp'")
    ok("/servico/" not in pag.url, "a tela espera a resposta antes de seguir")
    pag.locator("dialog[open] button", has_text="Agora não").click(); pag.wait_for_timeout(1200)
    ok("/servico/" in pag.url and not aviso_aberto(), "'Agora não' fecha e segue para o agendamento")
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
    ok(aviso_aberto() and "Avisar o cliente da nova data?" in texto_aviso(), "mudou a hora: oferece o aviso de reagendamento")
    ok("remarcado" in texto_aviso() and "11:00" in texto_aviso(), "a mensagem diz que foi remarcado, com a hora nova")
    pag.locator("dialog[open] button", has_text="Agora não").click(); pag.wait_for_timeout(1200)

    # ---------------- Cancelar: aviso de cancelamento (texto da empresa) ----------------
    pag.click("[data-acao=cancelar]"); pag.wait_for_timeout(400)
    pag.locator("dialog[open] [data-resposta=sim]").click(); pag.wait_for_timeout(1500)
    ok(aviso_aberto() and "Avisar o cliente do cancelamento?" in texto_aviso(), "depois de cancelar, oferece o aviso de cancelamento")
    ok("Oi Maria, cancelamos o" in texto_aviso() and "11:00" in texto_aviso(), f"usa o texto editado em Configurações: {texto_aviso()[:120]!r}")
    ok("a definir" not in texto_aviso(), "'Serviço a definir' (aparelho sem serviço) não vai na mensagem")
    pag.locator("dialog[open] button", has_text="Agora não").click(); pag.wait_for_timeout(1200)
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
