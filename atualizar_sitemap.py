#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
atualizar_sitemap.py - missaocantonfair.com

POR QUE ESTE ARQUIVO EXISTE
---------------------------
Medido em 28/08/2026: as seis URLs deste sitemap declaravam lastmod 2026-08-03
depois de tres commits de conteudo. O microsite passou quase um mes dizendo ao
rastreador que nada tinha mudado, justo no dominio que ganha as impressoes do
Google para "canton fair" e que alimenta o ChatGPT pelo indice do Bing.

O Google usa o lastmod para decidir quando voltar. Lastmod velho adia a visita,
e lastmod que nao corresponde a realidade faz o Google parar de confiar no
campo inteiro. Foi exatamente esse o diagnostico que criou o gerar_sitemap.py
do amoembarque.com em 07/08.

POR QUE NAO E UMA COPIA DO gerar_sitemap.py
-------------------------------------------
O do site principal GERA o sitemap do zero a partir do HTML. Aqui isso seria
destruicao: as 34 tags de imagem deste sitemap tem title e caption escritos a
mao, com nome de secao da feira, de expositor e de socia. Nenhum gerador
reconstroi isso a partir do alt.

Entao este script mexe em UMA coisa so: o valor dentro de <lastmod>. Tudo o
mais no arquivo, inclusive a ordem, os comentarios, as prioridades e as
legendas, sai daqui exatamente como entrou.

A data vem do git, nao do mtime. Num clone limpo da Netlify todo arquivo tem
mtime novo, e mtime diria que o site inteiro mudou hoje.

COMO USAR
    python3 atualizar_sitemap.py             confere e mostra o que esta errado
    python3 atualizar_sitemap.py --corrigir  grava as datas certas

O validar.py reprova o deploy quando as datas nao batem.
"""

import datetime
import io
import os
import re
import subprocess
import sys

DOMINIO = "https://missaocantonfair.com"
SITEMAP = "sitemap.xml"
HOJE = datetime.date.today().isoformat()
LIMITE_HISTORICO = 25

# O QUE CONTA COMO MUDANCA, E POR QUE ESTA REGRA E DIFERENTE DA DO SITE PRINCIPAL
#
# O gerar_sitemap.py do amoembarque.com decide isso por padrao de linha de diff:
# se toda linha alterada casar com "?v=<numero>" ou com uma tag de script de
# medicao, a mudanca e invisivel para o rastreador e nao vira lastmod novo.
# Funciona para bump de versao, que e uma linha so.
#
# Nao funcionou hoje. O commit de 28/08 inseriu o bloco do gtag nas seis
# paginas: trinta e poucas linhas entre comentario HTML, consent mode e config.
# Nenhuma casa com aquele padrao, entao as seis paginas seriam carimbadas como
# "mudou hoje" por causa de codigo que rastreador nenhum executa. E a segunda
# vez que isso acontece no projeto: em 15/08 a inclusao do amo-medir.js tocou as
# 75 paginas do site principal pelo mesmo motivo.
#
# Aqui a pergunta e feita direto, sem tentar adivinhar por regex de diff:
# tira <script>, <style> e comentario HTML das duas versoes do arquivo e ve se
# sobrou diferenca. Se nao sobrou, a pagina esta identica para quem le e para
# quem rastreia, e a data nao se mexe. E robusto por construcao: qualquer
# bloco de medicao futuro, de qualquer tamanho, ja entra coberto.
INVISIVEL_RX = [
    re.compile(r"<script\b.*?</script>", re.S | re.I),
    re.compile(r"<style\b.*?</style>", re.S | re.I),
    re.compile(r"<!--.*?-->", re.S),
    re.compile(r"\?v=\d+"),
]


def so_o_que_o_rastreador_le(html):
    for rx in INVISIVEL_RX:
        html = rx.sub("", html)
    return re.sub(r"\s+", " ", html).strip()


def sh(*args):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=20)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def arquivo_da_url(url):
    """URL publica -> arquivo em disco. A Netlify serve sem a extensao."""
    caminho = url[len(DOMINIO):]
    if caminho in ("", "/"):
        return "index.html"
    return caminho.strip("/") + ".html"


def mudanca_e_invisivel(commit, caminho):
    """A pagina ficou igual para quem le e para quem rastreia neste commit."""
    depois = sh("git", "show", commit + ":" + caminho)
    antes = sh("git", "show", commit + "^:" + caminho)
    if not depois or not antes:
        return False                      # commit inicial, ou arquivo novo
    return so_o_que_o_rastreador_le(antes) == so_o_que_o_rastreador_le(depois)


def pendente(caminho):
    """Conteudo em disco difere do commitado em HEAD.

    Comparado por 'git show HEAD:arquivo' e nao por 'git status': esta pasta e
    montada de um jeito em que o git as vezes falha por lock que nao consegue
    apagar, e status vazio seria lido como 'nada pendente'. Ler o banco de
    objetos funciona com lock, sem index, e num clone limpo devolve a verdade.
    """
    commitado = sh("git", "show", "HEAD:" + caminho)
    try:
        atual = io.open(caminho, encoding="utf-8", errors="ignore").read()
    except OSError:
        return False
    if not commitado:
        return True
    # Mesmo criterio do historico: se a diferenca so existe dentro de script,
    # style ou comentario, a pagina nao mudou para quem rastreia.
    return so_o_que_o_rastreador_le(commitado) != so_o_que_o_rastreador_le(atual)


def data_do_arquivo(caminho):
    if not os.path.isfile(caminho):
        return None
    if pendente(caminho):
        return HOJE
    historico = sh("git", "log", "--format=%H %cs", "--", caminho).splitlines()
    primeira = ""
    for linha in historico[:LIMITE_HISTORICO]:
        partes = linha.split()
        if len(partes) < 2 or not re.match(r"^\d{4}-\d{2}-\d{2}$", partes[1]):
            continue
        commit, d = partes[0], partes[1]
        if not primeira:
            primeira = d
        if not mudanca_e_invisivel(commit, caminho):
            return d
    # So houve bump de versao no periodo olhado: vale a data mais antiga vista,
    # nunca HOJE.
    return primeira or HOJE


def conferir(corrigir=False):
    if not os.path.isfile(SITEMAP):
        print("sitemap.xml nao encontrado. Nada a fazer.")
        return 0

    texto = io.open(SITEMAP, encoding="utf-8").read()
    blocos = list(re.finditer(r"<url>.*?</url>", texto, re.S))
    if not blocos:
        print("sitemap.xml sem blocos <url>. Nada a fazer.")
        return 0

    divergencias = []
    novo = texto
    # De tras para frente, para os deslocamentos nao invalidarem os offsets.
    for b in reversed(blocos):
        bloco = b.group(0)
        m_loc = re.search(r"<loc>(.*?)</loc>", bloco)
        m_lm = re.search(r"(<lastmod>)(.*?)(</lastmod>)", bloco)
        if not m_loc or not m_lm:
            continue
        url = m_loc.group(1).strip()
        atual = m_lm.group(2).strip()
        arq = arquivo_da_url(url)
        certa = data_do_arquivo(arq)
        if certa is None:
            divergencias.append((url, atual, "ARQUIVO NAO EXISTE: " + arq))
            continue
        if atual != certa:
            divergencias.append((url, atual, certa))
            if corrigir:
                bloco_novo = bloco[:m_lm.start(2)] + certa + bloco[m_lm.end(2):]
                novo = novo[:b.start()] + bloco_novo + novo[b.end():]

    if not divergencias:
        print("Sitemap em dia: as %d datas batem com o git." % len(blocos))
        return 0

    print("Sitemap desatualizado em %d de %d URLs:" % (len(divergencias), len(blocos)))
    for url, atual, certa in divergencias:
        print("  %-56s %s -> %s" % (url[len(DOMINIO):] or "/", atual, certa))

    if corrigir:
        io.open(SITEMAP, "w", encoding="utf-8").write(novo)
        print("\nCorrigido. So o valor dentro de <lastmod> mudou; imagens, "
              "legendas, prioridades e comentarios ficaram intactos.")
        return 0

    print("\nRode 'python3 atualizar_sitemap.py --corrigir' e faca commit.")
    return 1


if __name__ == "__main__":
    sys.exit(conferir("--corrigir" in sys.argv))
