"""
PACOTE 26 (modo demonstração):
 A) Serviço concluído: o selo mostra o prazo de retorno realmente usado (não o padrão do tipo).
 B) Retornos: a mensagem do WhatsApp diz há quanto tempo foi o último serviço ({tempo}).
 C) Equipe e convite: o WhatsApp do funcionário/convidado aparece.
 D) Técnico: a tela Concluídos se atualiza sozinha.
Uso: node scripts/servir-local.mjs &   python3 testes/telas/pacote26.py
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


def entrar(p, email):
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={"width": 390, "height": 844})
    ctx.add_init_script(path='testes/telas/sem-aviso.js')
    pag = ctx.new_page()
    erros = []
    pag.on("pageerror", lambda e: erros.append(str(e)))
    pag.goto(BASE + "#/entrar"); pag.wait_for_selector("#form-entrar")
    pag.fill("input[name=email]", email); pag.fill("input[name=senha]", "demo123")
    pag.click("#form-entrar [type=submit]"); pag.wait_for_selector(".menu-topo__item"); pag.wait_for_timeout(1000)
    return nav, pag, erros


def ir(pag, h):
    pag.evaluate(f"location.hash='#{h}'"); pag.wait_for_timeout(1200)


with sync_playwright() as p:
    nav, pag, erros = entrar(p, "demo@meutecnico.app")

    # A) selo do prazo usado
    pag.evaluate("""async () => {
      const { gravar, operacao } = await import('/js/nucleo/banco.js');
      await gravar([operacao.atualizar('empresas/demo-admin/servicos/s-c1', { retornoMeses: 12 })]);
    }""")
    ir(pag, "/servico/s-c1")
    texto = pag.inner_text("#conteudo")
    ok("Retorno em 12 meses" in texto, "concluído com retorno de 12 meses mostra 'Retorno em 12 meses'")
    ok("Retorno em 6 meses" not in texto, "não mostra mais o prazo padrão do tipo (6 meses) no concluído")
    ir(pag, "/servico/s-hoje-1")
    ok("Retorno em 6 meses" in pag.inner_text("#conteudo"), "serviço ainda agendado continua mostrando o prazo padrão do tipo")

    # B) mensagem de retorno
    ir(pag, "/retornos")
    pag.evaluate("window.__zap = []; window.open = (u) => { window.__zap.push(u); return null; }")
    pag.locator("[data-acao=avisar]").first.click(); pag.wait_for_timeout(600)
    zap = urllib.parse.unquote(pag.evaluate("(window.__zap.filter((u) => u && u.includes('wa.me'))[0]) || ''"))
    ok("Já faz" in zap and "da última" in zap, "a mensagem de retorno diz 'Já faz … da última …'")
    ok(re.search(r"Já faz (\d+ (dias?|mês|meses)|\d+ anos?)", zap) is not None, f"a mensagem traz o tempo desde o último serviço ({zap[:140]!r})")
    ok("{" not in zap, "nenhuma variável ficou sem trocar")

    # C) equipe e convite
    ir(pag, "/equipe")
    lista = pag.inner_text("#conteudo")
    ok(len(re.findall(r"\(\d\d\) 9\d{4}-\d{4}", lista)) >= 3, "a lista da Equipe mostra o WhatsApp de cada funcionário")
    pag.locator("#conteudo a:has-text('Sérgio')").click(); pag.wait_for_timeout(900)
    ok(re.search(r"WhatsApp: \(11\) 97654-3210", pag.inner_text("#conteudo")) is not None, "a tela do convite mostra o WhatsApp do convidado")
    nav.close()

    # D) técnico: Concluídos se atualiza sozinho
    nav, pag, erros = entrar(p, "tecnico@meutecnico.app")
    ir(pag, "/historico")
    antes = pag.locator("#conteudo a[href^='#/servico/']").count()
    pag.evaluate("""async () => {
      const { gravar, operacao } = await import('/js/nucleo/banco.js');
      await gravar([operacao.atualizar('empresas/demo-admin/servicos/s-hoje-1', { status: 'concluido', dataConclusao: new Date(), concluidoPorNome: 'Rafael Costa', descricao: 'Feito' })]);
    }""")
    pag.wait_for_timeout(21000)  # o roteador só atualiza depois de 20 s
    pag.evaluate("window.dispatchEvent(new Event('focus'))"); pag.wait_for_timeout(1800)
    depois = pag.locator("#conteudo a[href^='#/servico/']").count()
    ok(depois == antes + 1, f"o serviço concluído aparece em Concluídos sem sair da tela ({antes} -> {depois})")
    ok(not erros, f"sem erros de JavaScript ({erros[:2]})")
    nav.close()

print("\nFALHAS:", len(falhas))
raise SystemExit(1 if falhas else 0)
