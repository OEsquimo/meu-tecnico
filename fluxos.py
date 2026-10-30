"""
FLUXOS PRINCIPAIS (modo demonstração): cliente novo, detalhes, concluir serviço
como técnico (sem valor), convite de funcionário, painel do dono.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/fluxos.py
"""
import sys, re
from playwright.sync_api import sync_playwright
BASE = "http://localhost:5173/?demo=1"
falhas = []
def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c: falhas.append(m)

def entrar(p, email):
    nav = p.chromium.launch(); pag = nav.new_page(viewport={"width": 390, "height": 844})
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item")
    return nav, pag, erros

def ir(pag, h): pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(800)

with sync_playwright() as p:
    # ---- ADMIN ----
    nav, pag, erros = entrar(p, "demo@meutecnico.app")
    ir(pag, "/clientes")
    pag.locator("#conteudo a[href^='#/cliente/c-']").first.click(); pag.wait_for_timeout(800)
    ok("cliente" in pag.url and "novo" not in pag.url, "abre detalhe do cliente")
    ir(pag, "/agenda")
    link = pag.locator("#conteudo a[href^='#/servico/']").first
    ok(link.count() > 0, "agenda lista serviço do dia ou do mês")
    ir(pag, "/historico")
    h = pag.locator("#conteudo a[href^='#/servico/']").first
    if h.count():
        h.click(); pag.wait_for_timeout(800)
        ok("R$" in pag.inner_text("#conteudo") or "valor" in pag.inner_text("#conteudo").lower(), "admin vê valor no serviço concluído")

    # ---- ADMIN: agendamento com cartões (aparelhos e serviços) ----
    def escolher_cliente(nome):
        ir(pag, "/agenda"); ir(pag, "/agendar")
        pag.locator("[data-acao=escolher-cliente]", has_text=nome).click(); pag.wait_for_timeout(600)
    def agendar_data(data, hora):
        pag.fill("input[name=data]", data); pag.dispatch_event("input[name=data]", "change"); pag.wait_for_timeout(500)
        pag.fill("input[name=hora]", hora); pag.dispatch_event("input[name=hora]", "change"); pag.wait_for_timeout(500)
    def dialogo(texto):
        pag.locator("dialog [data-escolha]", has_text=texto).first.click(); pag.wait_for_timeout(400)
    def opcoes_tecnico():
        return pag.locator("select[name=tecnicoUid] option").all_inner_texts()

    # 1) só cliente, dia, hora e técnico (sem aparelho nem serviço)
    escolher_cliente("Ana Lima")
    ok(pag.locator("text=Sem aparelho").count() == 0, "não existe o botão 'Sem aparelho'")
    ok(pag.locator("[data-acao=adicionar-servico]").count() == 0, "sem aparelho no cartão não há 'Adicionar serviço'")
    agendar_data("2031-03-10", "09:00")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url, "agenda só com cliente, dia, hora e técnico")
    ok("Serviço a definir" in pag.inner_text("#conteudo"), "mostra 'Serviço a definir'")
    url_a_definir = pag.url
    sid_a_definir = pag.url.split("/servico/")[1]

    # 2) técnico ocupado some da lista (mesmo horário) e aparece de novo em outro horário
    escolher_cliente("Maria Souza")
    agendar_data("2031-03-10", "09:30")
    livres = opcoes_tecnico()
    ok(not any("Marcos" in t or "Rafael" in t for t in livres) or len(livres) < 3, "técnicos ocupados saem da lista")
    agendar_data("2031-03-10", "12:00")
    ok(len(opcoes_tecnico()) >= 2, "em outro horário os técnicos voltam")

    # 2b) todos os técnicos ocupados: aviso e botão Agendar bloqueado
    for _ in range(2):
        escolher_cliente("Ana Lima"); agendar_data("2031-03-11", "10:00")
        pag.click("#botao-salvar"); pag.wait_for_timeout(1200)
    escolher_cliente("Ana Lima"); agendar_data("2031-03-11", "10:00")
    ok("Nenhum técnico" in pag.inner_text("#conteudo"), "sem técnico livre: avisa na tela")
    ok(not pag.locator("#botao-salvar").is_disabled(), "o botão Agendar continua ativo (toque mostra o motivo)")
    pag.click("#botao-salvar"); pag.wait_for_timeout(700)
    ok("#/agendar" in pag.url and pag.locator(".aviso-rapido--erro").count() >= 1, "sem técnico livre: Agendar mostra o erro e não agenda")
    ok(pag.evaluate("(() => { const el = document.querySelector('[data-campo=hora] input'); const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()"), "a tela rolou até o campo da hora")
    ok(pag.evaluate("document.activeElement && document.activeElement.name") == "hora", "o cursor foi para o campo da hora")
    pag.locator(".aviso-rapido--erro").first.click(); pag.wait_for_timeout(200)
    ok(pag.locator(".aviso-rapido--erro").count() == 0, "um toque fecha o aviso antes da hora")
    escolher_cliente("Maria Souza"); agendar_data("2031-03-10", "12:00")

    # 3) vários aparelhos e serviços, um técnico por serviço
    pag.click("[data-acao=adicionar-aparelho]"); pag.wait_for_timeout(300); dialogo("Sala")
    pag.locator("[data-acao=adicionar-servico]").first.click(); pag.wait_for_timeout(300); dialogo("Limpeza")
    pag.locator("[data-acao=adicionar-servico]").first.click(); pag.wait_for_timeout(300); dialogo("Carga de gás")
    pag.click("[data-acao=adicionar-aparelho]"); pag.wait_for_timeout(300); dialogo("Quarto")
    pag.locator("[data-acao=adicionar-servico]").nth(1).click(); pag.wait_for_timeout(300); dialogo("Manutenção")
    ok(pag.locator(".agenda-aparelho").count() == 2 and pag.locator(".agenda-servico").count() == 3, "2 aparelhos e 3 serviços em cartões")
    sel = pag.locator("select[name^=tec-]")
    ok(sel.count() == 3 and sel.nth(0).locator("option").count() >= 2, "cada serviço tem a sua lista de técnicos")
    sel.nth(2).select_option(index=sel.nth(2).locator("option").count() - 1)  # técnico diferente no último serviço
    ok(pag.locator("textarea").count() == 0, "observações começam recolhidas (só o botão '+ Observação')")
    ok(pag.locator("[data-acao=editar-servico]").count() == 3, "cada serviço tem o botão Editar")
    # Editar e Remover do aparelho ficam lado a lado
    bx = pag.locator(".agenda-aparelho").first.locator("[data-acao=editar-aparelho]").bounding_box()
    br = pag.locator(".agenda-aparelho").first.locator("[data-acao=remover-aparelho]").bounding_box()
    ok(abs(bx["y"] - br["y"]) < 6, "Editar e Remover do aparelho ficam na mesma linha")
    # abre a observação do aparelho (fica no fim do cartão) e a do primeiro serviço
    pag.locator(".agenda-aparelho").first.locator("[data-acao=alternar-obs][data-tipo=grupo]").click(); pag.wait_for_timeout(300)
    ok(pag.locator("textarea[name^=obsAparelho-]").count() == 1, "toque abre a observação do aparelho")
    pag.fill("textarea[name^=obsAparelho-]", "Aparelho antigo")
    pag.locator("[data-acao=alternar-obs][data-tipo=servico]").first.click(); pag.wait_for_timeout(300)
    pag.fill("textarea[name^=obsServico-]", "Filtro sujo")
    pag.locator("[data-acao=alternar-obs][data-tipo=agendamento]").click(); pag.wait_for_timeout(300)
    pag.fill("textarea[name=observacao]", "Portão azul")
    # trocar o técnico (redesenha a tela) não fecha as observações abertas
    sel0 = pag.locator("select[name^=tec-]").first
    sel0.select_option(index=0); pag.wait_for_timeout(300)
    ok(pag.locator("textarea").count() == 3, "observações abertas continuam abertas depois de redesenhar")
    # Editar serviço: troca o tipo e a duração só deste serviço
    pag.locator("[data-acao=editar-servico]").nth(1).click(); pag.wait_for_timeout(300); dialogo("Instalação")
    pag.locator("dialog [data-escolha]", has_text="2h").first.click(); pag.wait_for_timeout(400)
    ok("Instalação" in pag.inner_text(".agenda-servico:nth-of-type(2)") or "Instalação" in pag.inner_text("#area-aparelhos"), "Editar troca o tipo do serviço")
    ok("2h (ajustada)" in pag.inner_text("#area-aparelhos"), "Editar ajusta a duração só desse serviço")
    pag.locator("[data-acao=editar-servico]").nth(1).click(); pag.wait_for_timeout(300); dialogo("Carga de gás")
    pag.locator("dialog [data-escolha]", has_text="Padrão do serviço").first.click(); pag.wait_for_timeout(400)
    pag.click("#botao-salvar"); pag.wait_for_timeout(1800)
    texto = pag.inner_text("#conteudo")
    ok("/servico/" in pag.url and texto.count("Concluir serviço") == 3, "detalhe mostra 3 serviços, cada um com 'Concluir serviço'")
    ok("Aparelho antigo" in texto and "Filtro sujo" in texto and "Portão azul" in texto, "observações do aparelho, do serviço e do agendamento aparecem")
    url_visita = pag.url

    # 4) editar o agendamento: remover um serviço e trocar o horário
    pag.locator("a:has-text('Editar')").first.click(); pag.wait_for_timeout(1200)
    ok(pag.locator(".agenda-servico").count() == 3, "editar abre os 3 serviços")
    pag.locator("[data-acao=remover-servico]").first.click(); pag.wait_for_timeout(400)
    agendar_data("2031-03-10", "13:00")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    texto = pag.inner_text("#conteudo")
    ok(texto.count("Concluir serviço") == 2 and "13:00" in texto, "edição removeu 1 serviço e mudou o horário")

    # 5) concluir exige aparelho e (se 'a definir') o tipo; aqui pelo administrador
    ir(pag, f"/concluir/{sid_a_definir}")
    ok(pag.locator("select[name=aparelhoId]").count() == 1 and pag.locator("input[name=tipoServicoId]").count() > 0, "serviço sem aparelho/tipo pede os dois ao concluir")
    pag.fill("textarea[name=descricao]", "Limpeza completa feita")
    pag.fill("input[name=valor]", "150")
    pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(600)
    ok("#/concluir/" in pag.url, "não conclui sem aparelho")
    ok("aparelho" in pag.inner_text("#conteudo").lower(), "mostra o aviso de aparelho obrigatório")

    # 6) tipo de serviço tem duração editável
    ir(pag, "/tipos-servico/novo")
    ok(pag.locator("input[name=duracaoMin]").count() == 1, "formulário do tipo tem a duração")
    pag.fill("input[name=nome]", "Teste duração"); pag.fill("input[name=duracaoMin]", "5"); pag.click("#form-tipo [type=submit]"); pag.wait_for_timeout(500)
    ok("minutos" in pag.inner_text("#conteudo"), "duração inválida mostra erro")
    pag.fill("input[name=duracaoMin]", "45"); pag.click("#form-tipo [type=submit]"); pag.wait_for_timeout(900)
    ok("45 min" in pag.inner_text("#conteudo"), "duração aparece na lista de tipos")
    ir(pag, "/equipe/novo")
    pag.fill("input[name=nome]", "Teste Silva"); pag.fill("input[name=telefone]", "11912345678")
    pag.click("#form-func [type=submit]"); pag.wait_for_timeout(1000)
    ok("equipe/convite" in pag.url, "criar convite leva à tela do link")
    ok("#/convite/" in pag.inner_text("#conteudo"), "link do convite aparece")
    ir(pag, "/financeiro"); ok("Recebido" in pag.inner_text("#conteudo"), "financeiro mostra Recebido")
    ok(not erros, f"admin sem erros de console ({erros[:2]})"); nav.close()

    # ---- TÉCNICO ----
    nav, pag, erros = entrar(p, "tecnico@meutecnico.app")
    ir(pag, "/agenda")
    l = pag.locator("#conteudo a[href^='#/servico/']").first
    if l.count():
        l.click(); pag.wait_for_timeout(800)
        sid = pag.url.split("/servico/")[1]
        ir(pag, f"/concluir/{sid}")
        ok(pag.locator("input[name=valor]").count() == 0, "técnico não tem campo de valor ao concluir")
        pag.fill("textarea[name=descricao]", "Limpeza completa feita")
        if pag.locator("select[name=aparelhoId]").count() and pag.locator("select[name=aparelhoId]").input_value() == "":
            pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(600)
            ok("#/concluir/" in pag.url, "técnico não conclui sem aparelho")
            pag.locator("select[name=aparelhoId]").select_option(index=1)
        pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(1200)
        ok(pag.url.endswith("#/") or pag.url.endswith("/"), "técnico conclui e volta ao início")
    else:
        print("  (técnico sem serviço no mês: fluxo de concluir não exercitado)")
    ir(pag, "/financeiro"); ok("#/financeiro" not in pag.url, "técnico não acessa financeiro")
    ok(not erros, f"técnico sem erros ({erros[:2]})"); nav.close()

    # ---- DONO ----
    nav, pag, erros = entrar(p, "dono@meutecnico.app")
    ir(pag, "/dono/contas")
    pag.locator("#conteudo [data-acao=abrir]").first.click(); pag.wait_for_timeout(500)
    ok("Ativar / renovar" in pag.inner_text("#conteudo"), "dono abre uma conta")
    ok(not erros, f"dono sem erros ({erros[:2]})"); nav.close()

if falhas: print("\nFALHAS:", *falhas, sep="\n - "); sys.exit(1)
print("\nTudo certo.")
