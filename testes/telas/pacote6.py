"""
PACOTE 6 (modo demonstração): cartão do cliente em Agendar, "Informar aparelhos e serviços" e aviso no Concluir.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote6.py
"""
from playwright.sync_api import sync_playwright
from _quando import escolher_quando, tecnicos_no_horario, informar
BASE = "http://localhost:5173/?demo=1"
falhas = []
def ok(c, m):
    print(("  ok  " if c else "  ERRO ") + m)
    if not c: falhas.append(m)

def entrar(pag, email):
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

with sync_playwright() as p:
    nav = p.chromium.launch(); pag = nav.new_page(viewport={"width": 390, "height": 844})
    erros = []
    pag.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: erros.append(str(e)))
    def ir(h): pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(900)
    def texto(): return pag.inner_text("#conteudo")
    def sem_rolagem(): return pag.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")

    # ---- Cartão do cliente em Agendar ----
    entrar(pag, "demo@meutecnico.app")
    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(600)
    card = pag.locator(".cliente-escolhido")
    ok(card.count() == 1 and card.locator(".avatar").count() == 0, "cartão do cliente sem iniciais")
    ok("Ana Lima" in card.inner_text() and "(" not in card.inner_text(), "cartão mostra o nome e não o telefone")
    ok(card.locator("[data-acao=editar-cliente] svg").count() == 1, "Editar com ícone de lápis")
    ok(pag.locator("[data-acao=trocar-cliente]").count() == 1 and "Não é o cliente?" in card.inner_text() and card.locator(".botao", has_text="Trocar").count() == 0, "link 'Não é o cliente?' no lugar do botão Trocar")
    ok("Se quiser, já inclua" not in texto(), "texto de ajuda de aparelhos e serviços removido")
    ok(sem_rolagem(), "Agendar sem rolagem lateral")
    pag.click("[data-acao=trocar-cliente]"); pag.wait_for_timeout(500)
    ok(pag.locator("[data-acao=escolher-cliente]").count() > 0, "'Não é o cliente?' reabre a busca")
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(600)
    escolher_quando(pag, "2031-04-10", "09:00")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url and "ainda não foram informados" in texto(), "agendado só com cliente, dia, hora e técnico")
    sid = pag.url.split("/servico/")[1]

    # ---- Linha "a definir": botão Informar, aviso amigável no Concluir ----
    ok("Aparelho e serviço ainda não foram informados" in texto() and pag.locator("button:has-text('Informar aparelho e serviço')").count() == 1 and pag.locator("a:has-text('Concluir serviço')").count() == 0, "detalhe: texto único e botão 'Informar aparelho e serviço' no lugar de Concluir")
    ok("Serviço a definir" not in texto() and pag.locator("text=Adicionar aparelhos e serviços").count() == 0, "sem 'Serviço a definir' e sem 'Adicionar' duplicado na visita vazia")
    ir(f"/concluir/{sid}")
    ok("Antes de concluir" in texto() and "Informar aparelhos e serviços" in texto(), "Concluir sem dados: aviso amigável")
    ok(pag.locator("input[name=tipoServicoId]").count() == 0, "Concluir não lista todos os serviços")

    # ---- Informar: aparelho primeiro, depois serviços ----
    pag.locator("a:has-text('Informar aparelhos e serviços')").click(); pag.wait_for_timeout(1500)
    ok("/servico/" in pag.url and "/informar/" not in pag.url and pag.locator("dialog[open]").count() == 1, "o aviso abre os diálogos simples na visita (sem a tela antiga)")
    pag.locator("dialog [data-escolha]").first.click(); pag.wait_for_timeout(400)
    pag.locator("dialog [data-escolha]", has_text="Limpeza").first.click(); pag.wait_for_timeout(1200)
    ok(pag.locator("a:has-text('Concluir serviço')").count() == 1, "informado o 1º serviço: Concluir")
    ok("Serviço a definir" not in texto() and "ainda não foram informados" not in texto(), "a linha 'a definir' foi consumida")
    informar(pag, servicos=("Manutenção",), primeiro="button:has-text('Adicionar aparelhos e serviços')")
    ok(pag.locator("a:has-text('Concluir serviço')").count() == 2, "salvo: dois serviços, cada um com Concluir")
    ok(pag.locator("button:has-text('Informar aparelho e serviço')").count() == 0, "sem mais 'Informar'")
    ok(sem_rolagem(), "detalhe sem rolagem lateral")

    # ---- Técnico informa sozinho; o administrador é avisado ----
    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Ana Lima").click(); pag.wait_for_timeout(600)
    escolher_quando(pag, "2031-04-11", "10:00", tecnico="Rafael")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    sid2 = pag.url.split("/servico/")[1]
    pag.goto(BASE + "#/entrar"); pag.reload(); pag.wait_for_timeout(800)
    entrar(pag, "tecnico@meutecnico.app")
    ir(f"/servico/{sid2}")
    ok(pag.locator("button:has-text('Informar aparelho e serviço')").count() == 1, "técnico vê 'Informar aparelho e serviço'")
    informar(pag, servicos=("Limpeza",))
    ok("/servico/" in pag.url and pag.locator("a:has-text('Concluir serviço')").count() == 1, "técnico informou: agora tem Concluir")
    ok("Incluído pelo técnico" in texto(), "marcado 'Incluído pelo técnico'")
    ok(pag.locator("[data-acao=editar-adicionado]").count() == 1, "técnico pode editar o que informou")
    ok(sem_rolagem(), "detalhe do técnico sem rolagem lateral")
    pag.goto(BASE + "#/entrar"); pag.reload(); pag.wait_for_timeout(800)
    entrar(pag, "demo@meutecnico.app")
    ok("incluiu 1 serviço em campo" in texto(), "administrador é avisado no Início")
    ok(not erros, f"sem erros no console ({erros[:2]})")
    nav.close()
print("FALHAS:" if falhas else "TUDO OK", falhas if falhas else "")
raise SystemExit(1 if falhas else 0)
