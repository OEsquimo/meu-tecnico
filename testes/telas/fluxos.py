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
        return pag.locator("#area-tecnico .tecnico-opcao").all_inner_texts()

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
    cx = lambda i: pag.locator(".agenda-servico").nth(i).locator("input[type=checkbox]")
    ok(pag.locator(".agenda-servico").nth(0).locator(".tecnico-opcao").count() >= 2 and cx(0).evaluate_all("l => l.filter(c => c.checked).length") == 1, "cada serviço tem a sua lista de técnicos, com um já marcado")
    cx(2).first.uncheck(); pag.wait_for_timeout(200)  # tira o técnico sugerido do último serviço...
    pag.locator(".agenda-servico").nth(2).locator("input[type=checkbox]").last.check(); pag.wait_for_timeout(300)  # ...e marca outro
    # vários técnicos no primeiro serviço: marca todos
    n0 = cx(0).count()
    for i in range(n0): cx(0).nth(i).check()
    pag.wait_for_timeout(300)
    ok(cx(0).evaluate_all("l => l.filter(c => c.checked).length") == n0 and n0 >= 2, "um serviço aceita mais de um técnico")
    cx(0).first.uncheck(); pag.wait_for_timeout(300)
    ok(cx(0).evaluate_all("l => l.filter(c => c.checked).length") == n0 - 1, "desmarcar um técnico mantém os outros")
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
    cx(1).first.check(); pag.wait_for_timeout(300)
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
    url_visita = pag.url  # uma linha que ainda existe

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
    # 6a) regressão: cliente criado pela tela -> Agendar -> "+ Novo aparelho" abre o formulário (não "Cliente não encontrado")
    ir(pag, "/cliente/novo")
    pag.fill("input[name=nome]", "Cliente Recém Criado"); pag.fill("input[name=whatsapp]", "11999998888")
    pag.locator("label.chip", has_text="Digitar à mão").first.click()
    for n, v in [("rua", "Rua A"), ("numero", "10"), ("cidade", "São Paulo")]:
        pag.locator(f"input[name$={n}]:visible").first.fill(v)
    pag.click("#form-cliente [type=submit]"); pag.wait_for_timeout(1200)
    
    pag.locator("[data-acao=agendar]").first.click(); pag.wait_for_timeout(900)
    
    pag.locator("[data-acao=novo-aparelho]").first.click(); pag.wait_for_timeout(900)
    ok("Cliente não encontrado" not in pag.inner_text("#conteudo") and pag.locator("#form-aparelho").count() == 1, "cliente novo: '+ Novo aparelho' abre o formulário do aparelho")
    pag.locator("select[name=tipo]").select_option(index=1)
    pag.click("#form-aparelho [type=submit]"); pag.wait_for_selector("#form-agendar", timeout=8000); pag.wait_for_timeout(300)
    ok("#/agendar" in pag.url and "Cliente Recém Criado" in pag.inner_text("#conteudo"), "depois de cadastrar o aparelho volta ao agendamento com o mesmo cliente")

    # 6a2) rascunho antigo não pode aparecer em outro agendamento: sai para "+ Novo aparelho" da Ana e abandona
    ir(pag, "/cliente/c-ana"); pag.locator("[data-acao=agendar]").first.click(); pag.wait_for_timeout(800)
    pag.locator("[data-acao=novo-aparelho]").first.click(); pag.wait_for_timeout(700)
    ir(pag, "/clientes")
    ir(pag, "/cliente/c-maria"); pag.locator("[data-acao=agendar]").first.click(); pag.wait_for_timeout(900)
    ok("Maria" in pag.inner_text("#conteudo") and "Ana Lima" not in pag.inner_text("#conteudo"), "agendamento novo não herda o cliente de uma tentativa abandonada")

    # 6b) valor padrão no tipo de serviço
    ir(pag, "/tipos-servico/novo")
    pag.fill("input[name=nome]", "Teste preço"); pag.fill("input[name=preco]", "abc"); pag.click("#form-tipo [type=submit]"); pag.wait_for_timeout(500)
    ok("inválido" in pag.inner_text("#conteudo").lower(), "valor padrão inválido mostra erro")
    pag.fill("input[name=preco]", "200,00"); pag.click("#form-tipo [type=submit]"); pag.wait_for_timeout(900)
    ok("R$" in pag.inner_text("#conteudo") and "200,00" in pag.inner_text("#conteudo"), "valor padrão aparece na lista de tipos")
    pag.locator("#conteudo a", has_text="Teste preço").first.click(); pag.wait_for_timeout(700)
    ok(pag.input_value("input[name=preco]") == "200,00", "editar o tipo mostra o valor padrão salvo")
    pag.fill("input[name=preco]", ""); pag.click("#form-tipo [type=submit]"); pag.wait_for_timeout(700)
    ok("200,00" not in pag.inner_text("#conteudo"), "apagar o valor padrão tira da lista")

    # 6c) concluir com valor padrão, extras e desconto (administrador)
    ir(pag, url_visita.split("#")[1])
    href = pag.locator("a[href^='#/concluir/']").first.get_attribute("href")
    ir(pag, href.split("#")[1])
    ok(pag.locator("textarea[name=descricao]").count() == 1 and pag.evaluate("(() => { const f = document.querySelector('#form-concluir'); const d = f.querySelector('[name=descricao]'); const v = f.querySelector('[name=valor]'); return !!(d.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_PRECEDING); })()"), "'O que foi feito?' fica abaixo do valor")
    ok(pag.input_value("input[name=valor]") != "", "valor padrão do tipo já vem preenchido")
    base = pag.input_value("input[name=valor]")
    pag.click("[data-acao=adicionar-extra]"); pag.wait_for_timeout(200)
    pag.fill("input[name=extraDescricao]", "Peça"); pag.fill("input[name=extraValor]", "50,00")
    pag.fill("input[name=desconto]", "20,00"); pag.wait_for_timeout(200)
    total = pag.inner_text("#total-valores")
    ok("R$" in total, f"total aparece na hora ({total})")
    pag.fill("input[name=extraValor]", "abc"); pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(500)
    ok("#/concluir/" in pag.url and "extras" in pag.inner_text("#conteudo").lower(), "extra inválido bloqueia e avisa")
    pag.fill("input[name=extraValor]", "50,00")
    if pag.locator("select[name=aparelhoId]").count() and pag.locator("select[name=aparelhoId]").input_value() == "":
        pag.locator("select[name=aparelhoId]").select_option(index=1)
    pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(1200)
    if pag.locator("dialog", has_text="pendente").count(): pag.locator("dialog button", has_text="Decidir depois").click(); pag.wait_for_timeout(800)
    ok(pag.url.endswith("#/") or pag.url.endswith("/"), "concluiu sem escrever 'o que foi feito' (opcional)")
    ir(pag, "/servico/" + href.split("/concluir/")[1])
    txt = pag.inner_text("#conteudo")
    ok("Extra: Peça" in txt and "Desconto" in txt and "Total" in txt, "detalhe mostra extra, desconto e total")
    pag.locator("a:has-text('Corrigir valor')").first.click(); pag.wait_for_timeout(800)
    ok(pag.input_value("input[name=desconto]") == "20,00" and pag.locator("input[name=extraDescricao]").count() == 1, "corrigir valor abre com os dados gravados")
    pag.fill("input[name=desconto]", "30,00"); pag.click("#form-valor [type=submit]"); pag.wait_for_timeout(900)
    ok("30,00" in pag.inner_text("#conteudo"), "administrador corrige o desconto de serviço concluído")

    # 6d) permissões do funcionário
    ir(pag, "/equipe/eq-rafael")
    ok(pag.locator("input[name=verValores]").is_checked() and not pag.locator("input[name=alterarValores]").is_checked(), "funcionário demo pode ver e não alterar valores")
    pag.check("input[name=alterarValores]"); pag.click("#form-func [type=submit]"); pag.wait_for_timeout(900)
    ir(pag, "/equipe/eq-rafael")
    ok(pag.locator("input[name=alterarValores]").is_checked() and pag.locator("input[name=verValores]").is_checked(), "quem altera também vê (permissão salva)")
    ir(pag, "/equipe/novo")
    ok(not pag.locator("input[name=verValores]").is_checked() and not pag.locator("input[name=alterarValores]").is_checked(), "funcionário novo começa sem ver nem alterar valores")
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
        ok(pag.locator("input[name=valor]").count() == 0, "técnico só com 'ver valores' não edita o valor")
        ok(pag.locator(".editor-valores--leitura").count() == 1, "técnico com 'ver valores' vê o valor ao concluir")
        pag.fill("textarea[name=descricao]", "Limpeza completa feita")
        if pag.locator("select[name=aparelhoId]").count() and pag.locator("select[name=aparelhoId]").input_value() == "":
            pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(600)
            ok("#/concluir/" in pag.url, "técnico não conclui sem aparelho")
            pag.locator("select[name=aparelhoId]").select_option(index=1)
        pag.click("#form-concluir [type=submit]"); pag.wait_for_timeout(1200)
        if pag.locator("dialog", has_text="pendente").count(): pag.locator("dialog button", has_text="Decidir depois").click(); pag.wait_for_timeout(800)
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
