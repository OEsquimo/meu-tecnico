"""
PACOTE 10d (modo demonstração): "Informar aparelho e serviço" pelos diálogos simples (sem a tela antiga), endereço antigo /informar redireciona.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote10d.py
"""
from playwright.sync_api import sync_playwright
from _quando import escolher_quando, informar
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
    def ir(h): pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1000)
    def texto(): return pag.inner_text("#conteudo")
    def confirmar(): pag.locator("dialog button", has_text="Excluir serviço").or_(pag.locator("dialog button", has_text="Remover da visita")).first.click(); pag.wait_for_timeout(1500)
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", "demo@meutecnico.app"); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)

    ir("/agenda"); ir("/agendar")
    pag.locator("[data-acao=escolher-cliente]", has_text="Maria Souza").click(); pag.wait_for_timeout(600)
    escolher_quando(pag, "2031-07-10", "09:00")
    pag.click("#botao-salvar"); pag.wait_for_timeout(1500)
    sid = pag.url.split("/servico/")[1]

    # ---- visita vazia ----
    ok("Aparelho e serviço ainda não foram informados" in texto(), "texto único na visita vazia")
    ok(pag.locator("button:has-text('Informar aparelho e serviço')").count() == 1, "um botão 'Informar aparelho e serviço'")
    ok("Serviço a definir" not in texto() and "Escolha ou cadastre" not in texto(), "sem 'Serviço a definir' nem texto antigo")
    ok(pag.locator("text=Adicionar aparelhos e serviços").count() == 0 and pag.locator("text=Adicionar serviço na visita").count() == 0, "sem botão 'Adicionar' duplicado")
    ok(pag.locator("[data-acao=remover-servico], [data-acao=remover-aparelho]").count() == 0, "nada para excluir na visita vazia")

    # ---- endereço antigo e ?informar=1 ----
    ir(f"/informar/{sid}")
    ok("/servico/" in pag.url and "/informar/" not in pag.url and pag.locator("dialog[open]").count() == 1, "/informar redireciona e abre 'Em qual aparelho?'")
    ok("Em qual aparelho?" in pag.locator("dialog").inner_text(), "pergunta do aparelho")
    pag.keyboard.press("Escape"); pag.wait_for_timeout(300)

    # ---- informar dois serviços no mesmo aparelho ----
    informar(pag, servicos=("Limpeza", "Manutenção"), aparelho="Quarto")
    ok(pag.locator("a:has-text('Concluir serviço')").count() == 2, "dois serviços, cada um com Concluir")
    ok("Serviço a definir" not in texto() and "ainda não foram informados" not in texto(), "linha 'a definir' consumida")
    ok(pag.locator("button:has-text('Adicionar aparelhos e serviços')").count() == 1, "'Adicionar aparelhos e serviços' aparece com serviço real")
    ok(pag.locator("[data-acao=remover-servico], [data-acao=remover-aparelho]").count() == 0 and pag.locator("text=Remover da visita").count() == 0, "sem 'Excluir' no serviço nem 'Remover da visita' (isso fica no Editar)")

    ok(not erros, f"sem erros no console ({erros[:2]})")
    nav.close()
print("FALHAS:" if falhas else "TUDO OK", falhas if falhas else "")
raise SystemExit(1 if falhas else 0)
