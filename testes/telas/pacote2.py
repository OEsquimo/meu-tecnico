"""
PACOTE 2 (modo demonstração): cobrança no WhatsApp, configuração da cobrança,
serviço pendente, Cancelar/Excluir na Início, endereços recolhidos e textos sem espremer.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote2.py
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
    pag.add_init_script("window.__abertos=[]; window.open=(u)=>{window.__abertos.push(u);return null;}")
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item")
    def ir(h): pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(900)
    def texto(): return pag.inner_text("#conteudo")
    def sem_rolagem_lateral(): return pag.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")

    # ---- Configurações: cobrança ----
    ir("/configuracoes")
    ok(pag.locator("input[name=chavePix]").count() == 1, "campo da chave Pix")
    ok(pag.locator("input[name=tomCobranca]").count() == 2, "dois tons: Amigável e Formal")
    ok(pag.locator("textarea[name=mensagemCobranca]").input_value().strip() != "", "mensagem de cobrança já vem preenchida")
    pag.fill("input[name=chavePix]", "pix@marcosfrio.com"); pag.wait_for_timeout(300)
    ok("pix@marcosfrio.com" in pag.inner_text("#previa-cobranca"), "prévia mostra o Pix")
    pag.locator("input[name=tomCobranca][value=formal]").check(force=True); pag.wait_for_timeout(300)
    ok("Prezado" in pag.locator("textarea[name=mensagemCobranca]").input_value(), "tom Formal troca o texto")
    pag.click("#form-config [type=submit]"); pag.wait_for_timeout(1500)
    ir("/configuracoes")
    ok(pag.locator("input[name=chavePix]").input_value() == "pix@marcosfrio.com", "Pix ficou salvo")

    # ---- Cobrar no WhatsApp (concluído e a receber) ----
    ir("/historico")
    achou = False
    for i in range(pag.locator("#resultado a[href^='#/servico/']").count()):
        pag.locator("#resultado a[href^='#/servico/']").nth(i).click(); pag.wait_for_timeout(900)
        if pag.locator("[data-acao=cobrar]").count() > 0:
            achou = True; break
        ir("/historico")
    ok(achou, "serviço concluído e a receber tem 'Cobrar no WhatsApp'")
    if achou:
        pag.locator("[data-acao=cobrar]").first.click(); pag.wait_for_timeout(1500)
        abertos = pag.evaluate("window.__abertos")
        ok(len(abertos) == 1 and "wa.me" in abertos[0], "abre o WhatsApp com a mensagem")
        ok("pix%40marcosfrio.com" in abertos[0] or "Chave%20Pix" in abertos[0], "a mensagem leva o Pix")
        ok("Cobrado em" in texto(), "registra 'Cobrado em'")
        ok("Marcar como pago" in texto(), "continua a receber (cobrar não marca como pago)")
    # concluído e pago nunca tem botão de cobrar
    ir("/historico")
    for i in range(pag.locator("#resultado a[href^='#/servico/']").count()):
        item = pag.locator("#resultado a[href^='#/servico/']").nth(i)
        if "Pago" in item.inner_text():
            item.click(); pag.wait_for_timeout(900)
            ok(pag.locator("[data-acao=cobrar]").count() == 0, "serviço pago não tem botão de cobrar")
            break

    # ---- Início: Cancelar e Excluir ----
    ir("/")
    ok(pag.locator("[data-acao=cancelar-visita]").count() == 1 and pag.locator("[data-acao=excluir-visita]").count() == 1, "Início tem Cancelar e Excluir na próxima visita")
    ok(sem_rolagem_lateral(), "Início sem rolagem lateral (390px)")

    # ---- Telas sem texto espremido (390px) ----
    for rota in ["/", "/agenda", "/reagendamentos", "/historico", "/clientes"]:
        ir(rota)
        ok(sem_rolagem_lateral(), f"{rota} sem rolagem lateral")
        menor = pag.evaluate("Math.min(...[...document.querySelectorAll('.item-lista__titulo')].map(e=>e.getBoundingClientRect().width), 999)")
        ok(menor >= 100, f"{rota}: títulos não ficam espremidos (menor {menor:.0f}px)")

    # ---- Cancelar -> selo curto e texto completo no detalhe ----
    ir("/agenda")
    link = pag.locator("#conteudo a[href^='#/servico/']").first
    link.click(); pag.wait_for_timeout(900)
    pag.click("[data-acao=cancelar]"); pag.wait_for_timeout(400)
    pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1200)
    ir("/reagendamentos")
    ok("Cancelado — aguardando reagendamento" in texto(), "cancelado pelo admin mantém o texto 'Cancelado — aguardando reagendamento'")
    larg = pag.evaluate("[...document.querySelectorAll('.servico-cartao .item-lista__titulo')].map(e=>e.getBoundingClientRect().width)")
    ok(all(w >= 100 for w in larg), "cartão de reagendamento com título legível")

    # ---- Serviço pendente: concluir um, o outro fica pendente ----
    ir("/agenda"); pag.locator("#conteudo a[href^='#/servico/']").first.click(); pag.wait_for_timeout(900)
    pag.click("[data-acao=adicionar-servico]"); pag.wait_for_timeout(500)
    pag.locator("dialog .janela__opcao").first.click(); pag.wait_for_timeout(500)
    pag.locator("dialog .janela__opcao").first.click(); pag.wait_for_timeout(1200)
    pag.locator("a[href*='/concluir/']").first.click(); pag.wait_for_timeout(900)
    v = pag.locator("input[name=valor]")
    if v.count() and not v.input_value(): v.fill("100")
    pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(1200)
    ok("serviço pendente nesta visita" in pag.inner_text("dialog"), "ao concluir, pergunta sobre o serviço que sobrou")
    ok("Fazer ainda hoje" in pag.inner_text("dialog") and "Não deu para fazer" in pag.inner_text("dialog"), "opções 'Fazer ainda hoje' e 'Não deu para fazer'")
    pag.locator("dialog [data-escolha=nao]").click(); pag.wait_for_timeout(500)
    ok("Por que ficou pendente?" in pag.inner_text("dialog"), "pergunta o motivo")
    pag.locator("dialog [data-escolha=outro]").click(); pag.wait_for_timeout(500)
    pag.fill("dialog [data-texto]", "cliente viajou"); pag.click("dialog [data-resposta=sim]"); pag.wait_for_timeout(1500)
    ir("/reagendamentos")
    ok("Pendente — aguardando reagendamento" in texto() and "cliente viajou" in texto(), "pendente aparece com o motivo para o administrador")

    # ---- Cliente com vários endereços: mostra só o atual ----
    ir("/clientes")
    for i in range(pag.locator("#conteudo a[href^='#/cliente/']").count()):
        ir("/clientes"); pag.locator("#conteudo a[href^='#/cliente/']").nth(i).click(); pag.wait_for_timeout(900)
        if "Ver todos os endereços" in texto(): break
    ok("Ver todos os endereços" in texto(), "ficha mostra o link 'Ver todos os endereços (N)'")
    ok(pag.locator(".endereco-item").count() == 1, "mostra só um endereço")
    pag.click("[data-acao=alternar-enderecos]"); pag.wait_for_timeout(400)
    ok(pag.locator(".endereco-item").count() > 1 and "Mostrar só o atual" in texto(), "link mostra todos e depois volta")
    ok(sem_rolagem_lateral(), "ficha do cliente sem rolagem lateral")

    ok(not erros, "sem erros no console" + ("" if not erros else f": {erros[:3]}"))
    nav.close()

print("\nFALHAS:" if falhas else "\nTudo certo.", *falhas, sep="\n")
raise SystemExit(1 if falhas else 0)
