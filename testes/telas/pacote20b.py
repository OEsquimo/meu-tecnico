"""
PACOTE 20B (modo demonstração): painel de avisos pelo WhatsApp para o cliente e para os técnicos.
Depois de agendar, reagendar e cancelar, o administrador vê uma linha para o cliente e uma para cada técnico
(menos ele mesmo). "Abrir conversa" abre o WhatsApp; ao voltar, o app pergunta "Enviei" / "Não enviei".
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote20b.py
"""
from urllib.parse import unquote
from playwright.sync_api import sync_playwright
from _quando import escolher_quando, SELETOR

BASE = "http://localhost:5173/?demo=1"
DIA = "2031-09-03"
PAINEL = "dialog[open][data-avisos]"
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c:
        falhas.append(m)


with sync_playwright() as p:
    nav = p.chromium.launch()
    pag = nav.new_page(viewport={"width": 390, "height": 844})
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))

    def ir(h):
        pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1000)

    def botao(id_):
        return pag.locator(f"{PAINEL} a[data-abrir='{id_}']")

    def mensagem(id_):
        return unquote(botao(id_).get_attribute("href").split("text=")[1])

    def ids():
        return pag.locator(f"{PAINEL} a[data-abrir]").evaluate_all("els => els.map(e => e.dataset.abrir)")

    def fechar():
        pag.locator(f"{PAINEL} [data-fechar]").click(); pag.wait_for_timeout(1200)

    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    # ---------------- Agendar com o Rafael: painel com cliente e técnico ----------------
    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Maria Souza").click(); pag.wait_for_timeout(600)
    pag.locator("[data-acao=adicionar-aparelho]").first.click(); pag.wait_for_timeout(400)
    pag.locator("dialog [data-escolha]", has_text="Quarto").first.click(); pag.wait_for_timeout(500)
    escolher_quando(pag, DIA, "09:00", tecnico="Rafael")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1800)
    ok(pag.locator(PAINEL).count() == 1, "depois de agendar abre o painel de avisos")
    lista = ids()
    ok(len(lista) == 2 and lista[0] == "cliente" and lista[1].startswith("tec:"), f"um botão para o cliente e um para o técnico ({lista})")
    tid = lista[1]
    ok(botao("cliente").inner_text().strip() == "Mensagem para Maria", "botão do cliente: 'Mensagem para Maria'")
    ok(botao(tid).inner_text().strip() == "Mensagem técnico Rafael", "botão do técnico: 'Mensagem técnico Rafael'")
    ok(not any(t in pag.inner_text(PAINEL) for t in ["Pendente", "Ignorar", "Enviei", "enviada", "aberta"]), "o painel não tem textos de estado, nem Ignorar, nem pergunta")
    mc, mt = mensagem("cliente"), mensagem(tid)
    ok("confirmado" in mc and "Maria" in mc and "09:00" in mc, f"mensagem do cliente: {mc[:80]!r}")
    ok("novo serviço agendado" in mt and "Maria Souza" in mt and "09:00" in mt, f"mensagem do técnico: {mt[:80]!r}")
    ok("#/servico/" in mt and "Bom trabalho!" in mt, "o técnico recebe o link do app e a despedida")
    ok("Serviços:" not in mt and "Limpeza" not in mt, "a mensagem do técnico não lista os serviços")
    ok("wa.me/5511912345678" in mt and "Telefone: (11) 91234-5678" in mt, "o técnico recebe o link do WhatsApp do cliente e o número escrito")
    ok(botao("cliente").get_attribute("href").startswith("https://wa.me/5511912345678?text="), "o botão do cliente abre o WhatsApp dele")
    ok(botao(tid).get_attribute("href").startswith("https://wa.me/5511987654321?text="), "o botão do técnico abre o WhatsApp dele")
    ok("/servico/" not in pag.url, "a tela espera o painel fechar")

    # ---------------- Botão tocado fica cinza e continua funcionando ----------------
    ok("avisos__botao--tocado" not in botao("cliente").get_attribute("class"), "antes de tocar o botão não é cinza")
    with pag.context.expect_page() as nova:
        botao("cliente").click()
    nova.value.close(); pag.wait_for_timeout(700)
    ok("avisos__botao--tocado" in botao("cliente").get_attribute("class"), "depois de tocar o botão fica cinza")
    ok("avisos__botao--tocado" not in botao(tid).get_attribute("class"), "o outro botão continua normal")
    with pag.context.expect_page() as nova:
        botao("cliente").click()
    nova.value.close()
    ok(botao("cliente").count() == 1, "o botão cinza continua ali para enviar de novo")
    fechar()
    ok("/servico/" in pag.url and pag.locator(PAINEL).count() == 0, "fechar o painel segue para o agendamento")
    url_servico = pag.url.split("#")[1]

    # ---------------- Reagendar: o técnico recebe a data anterior ----------------
    ir(f"{url_servico}/editar"); pag.wait_for_selector("#botao-salvar"); pag.wait_for_timeout(600)
    pag.click("#botao-quando"); pag.wait_for_selector(f"{SELETOR}[open]")
    pag.wait_for_function("!document.querySelector('dialog.seletor')?.innerText.includes('Carregando')", timeout=8000)
    pag.click(f"{SELETOR} [data-acao=seletor-hora][data-hora='11:00']"); pag.click(f"{SELETOR} [data-acao=seletor-confirmar]")
    pag.wait_for_selector(SELETOR, state="detached"); pag.wait_for_timeout(600)
    pag.click("#botao-salvar"); pag.wait_for_timeout(1800)
    ok(pag.locator(PAINEL).count() == 1 and "nova data" in pag.inner_text(PAINEL).lower(), "mudou a hora: painel de reagendamento")
    mt = mensagem(tid); mc = mensagem("cliente")
    ok("reagendado" in mc and "11:00" in mc, "cliente: 'Seu serviço foi reagendado' com a hora nova")
    ok("anterior" not in mt.lower() and "Novo horário: 11:00" in mt, f"técnico recebe só a nova data e o novo horário (Pacote 30): {mt[:140]!r}")
    fechar()

    # ---------------- Cancelar ----------------
    pag.click("[data-acao=cancelar-servico]"); pag.wait_for_timeout(400)
    pag.locator("dialog[open] [data-resposta=sim]").click(); pag.wait_for_timeout(1800)
    ok(pag.locator(PAINEL).count() == 1 and "cancelamento" in pag.inner_text(PAINEL), "depois de cancelar abre o painel")
    mt = mensagem(tid); mc = mensagem("cliente")
    ok("foi cancelado" in mt and "#/servico/" not in mt, "técnico: aviso de cancelamento sem link do app")
    ok("cancelado" in mc and "Maria" in mc, "cliente: aviso de cancelamento")
    fechar()
    ok("#/agenda" in pag.url, "depois do painel, volta para a Agenda")

    # ---------------- Administrador atendendo sozinho: só o cliente ----------------
    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Maria Souza").click(); pag.wait_for_timeout(600)
    pag.locator("[data-acao=adicionar-aparelho]").first.click(); pag.wait_for_timeout(400)
    pag.locator("dialog [data-escolha]", has_text="Quarto").first.click(); pag.wait_for_timeout(500)
    escolher_quando(pag, DIA, "14:00", tecnico="Marcos")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1800)
    ok(ids() == ["cliente"], "técnico = administrador: só o botão do cliente")
    fechar()

    # ---------------- Técnico não vê o painel ----------------
    ctx2 = nav.new_context(viewport={"width": 390, "height": 844}); tec = ctx2.new_page()
    tec.goto(BASE + "#/entrar"); tec.wait_for_selector("#form-entrar")
    tec.fill("input[name=email]", "tecnico@meutecnico.app"); tec.fill("input[name=senha]", "demo123")
    tec.click("#form-entrar [type=submit]"); tec.wait_for_selector(".menu-topo__item"); tec.wait_for_timeout(1000)
    ok(tec.locator(PAINEL).count() == 0, "o técnico não vê painel de avisos")

    ok(not [e for e in erros if "favicon" not in e], f"sem erros no console: {erros[:3]}")
    nav.close()

print("\nFALHAS:" if falhas else "\nTudo certo.", falhas or "")
raise SystemExit(1 if falhas else 0)
