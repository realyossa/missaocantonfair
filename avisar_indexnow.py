#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
avisar_indexnow.py — missaocantonfair.com

Avisa os buscadores das paginas que mudaram neste deploy.

POR QUE ISTO EXISTE
-------------------
O diagnostico de 07/08 mediu o gargalo real da indexacao: 262 requisicoes de
rastreio em 90 dias, sendo apenas 9% de deteccao de pagina nova. Menos de 0,1
descoberta por dia. Publicar uma pagina e esperar o Googlebot passar sozinho
custava semanas.

O IndexNow inverte isso: em vez de esperar o crawler, o site avisa. Bing, Yandex,
Seznam e Naver compartilham o mesmo ping. O Google nao participa do protocolo —
para ele continua valendo o sitemap com lastmod correto, que o gerar_sitemap.py
ja garante. Ainda assim vale muito: o Bing alimenta o Copilot, e a AMO ja tem
rastreio ativo do bingbot.

O que o script faz: descobre quais .html mudaram entre o commit anterior e o
atual, converte em URL e pinga uma por vez. Nao ha lista escrita a mao — o que
nao mudou nao e avisado, e avisar pagina que nao mudou queima confianca no
protocolo.

POR QUE SO CHEGOU AQUI EM 28/08
-------------------------------
A chave do IndexNow ja estava hospedada neste dominio desde o inicio, parada:
nada nunca pingou. E este e o dominio onde o ping rende mais, porque quem
alimenta a resposta do ChatGPT e o indice do Bing, e o Bing e justamente quem
participa do protocolo. O Google nao participa; para ele vale o sitemap com
lastmod correto, que o atualizar_sitemap.py agora garante.

SEGURANCA
---------
Este script NUNCA derruba o deploy. Falha de rede, timeout, buscador fora do ar
ou ausencia de git resultam em aviso no log e saida 0. O deploy da AMO nao pode
depender da disponibilidade de um servico de terceiro.

LIMITE CONHECIDO
----------------
Roda no comando de build, ou seja, alguns segundos ANTES de a versao nova ficar
publica. Na pratica nao atrapalha: o buscador enfileira o aviso e rastreia
minutos ou horas depois. O caso ruim seria a publicacao falhar depois do build,
e ai teriamos anunciado uma URL que nao mudou — custo baixo o suficiente para
nao justificar um plugin de build so por isso. Se um dia a Netlify passar a
falhar publicacao com frequencia, mover para um plugin com onSuccess.
"""

import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

DOMINIO = "https://missaocantonfair.com"
CHAVE = "980a67aba18b579bbf262914ab2abff4"
ENDPOINT = "https://api.indexnow.org/indexnow"
TEMPO_LIMITE = 12          # segundos por ping
TETO = 80                  # avisos por deploy. O que separa edicao de migracao
                           # nao e o numero: e a natureza da mudanca. Ver
                           # so_mudou_versao_de_asset() logo abaixo.

# Paginas que nunca devem ser anunciadas: nao sao conteudo de busca.
FORA = {
    # arquivo de verificacao de propriedade do Search Console — nao e pagina
    "google06948f8d5d62d0b6.html",
}


def sh(*args):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=20)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def url_de(caminho):
    if caminho == "index.html":
        return DOMINIO + "/"
    if caminho.endswith("/index.html"):
        return DOMINIO + "/" + caminho[: -len("index.html")]
    return DOMINIO + "/" + caminho[: -len(".html")]


def paginas_que_mudaram():
    """HTML alterado desde o ULTIMO DEPLOY, nao desde o ultimo commit.

    Comparar com HEAD~1 parecia certo e nao era: um push com tres commits
    anunciava so as paginas do terceiro. Aconteceu em 15/08, com dois commits
    subindo juntos — as paginas do primeiro nunca teriam sido anunciadas.

    A Netlify expoe CACHED_COMMIT_REF com o commit do deploy anterior. Quando
    ele existe e o git o conhece, e ele que define o intervalo. Fora da Netlify
    (ou em clone raso que nao tem aquele commit) cai para HEAD~1, que continua
    correto para o caso de um commit por push.

    Sem git, devolve lista vazia de proposito: e melhor nao avisar nada do que
    avisar o site inteiro por engano."""
    anterior = os.environ.get("CACHED_COMMIT_REF", "").strip()
    if anterior and sh("git", "cat-file", "-e", anterior + "^{commit}") is not None:
        base = anterior
    else:
        base = "HEAD~1"
    saida = sh("git", "diff", "--name-only", base, "HEAD")
    if not saida:
        return []
    achados = []
    for linha in saida.splitlines():
        c = linha.strip()
        if not c.endswith(".html") or c in FORA:
            continue
        if c.startswith("_to_delete/") or not os.path.isfile(c):
            continue
        if "noindex" in ler(c):
            continue
        if so_mudou_versao_de_asset(base, c):
            continue
        achados.append(c)
    return sorted(set(achados))


def so_mudou_versao_de_asset(base, caminho):
    """A pagina ficou igual para quem le e para quem rastreia neste intervalo.

    O nome ficou do site principal, mas o criterio aqui e outro e melhor. La a
    pergunta e feita por padrao de linha de diff: se toda linha alterada casar
    com "?v=<numero>" ou com uma tag de script, e invisivel. Funciona para bump
    de versao, que e uma linha so, e falhou em 28/08, quando o bloco do gtag
    entrou com trinta e poucas linhas nas seis paginas. Sem esta correcao o
    deploy anunciaria seis URLs por causa de codigo que rastreador nao executa,
    e avisar pagina que nao mudou queima confianca no protocolo.

    Aqui tira <script>, <style> e comentario HTML das duas versoes e compara o
    que sobrou. Robusto por construcao: qualquer bloco de medicao futuro, de
    qualquer tamanho, ja entra coberto.
    """
    depois = ler_inteiro(caminho)
    antes = sh("git", "show", base + ":" + caminho)
    if not antes or not depois:
        return False
    return so_o_que_o_rastreador_le(antes) == so_o_que_o_rastreador_le(depois)


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


def ler_inteiro(caminho):
    try:
        with open(caminho, encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception:
        return ""


def ler(caminho):
    try:
        with open(caminho, encoding="utf-8", errors="ignore") as f:
            return f.read(4000)
    except Exception:
        return ""


def avisar(url):
    alvo = "%s?url=%s&key=%s" % (ENDPOINT, urllib.parse.quote(url, safe=":/"), CHAVE)
    req = urllib.request.Request(alvo, headers={"User-Agent": "amoembarque-indexnow/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TEMPO_LIMITE) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        return str(e)[:60]


def main():
    mudaram = paginas_que_mudaram()
    if not mudaram:
        print("IndexNow: nenhuma pagina HTML mudou neste commit. Nada a avisar.")
        return 0

    if len(mudaram) > TETO:
        print("IndexNow: %d paginas mudaram, acima do teto de %d. Nao avisei nada — "
              "volume assim e migracao ou reformatacao em massa, e nesse caso o "
              "sitemap resolve melhor que %d pings." % (len(mudaram), TETO, len(mudaram)))
        return 0

    print("IndexNow: %d pagina(s) mudaram neste deploy." % len(mudaram))
    ok = 0
    for c in mudaram:
        u = url_de(c)
        r = avisar(u)
        marca = "ok " if r in (200, 202) else "-- "
        if r in (200, 202):
            ok += 1
        print("  %s %-58s %s" % (marca, u[len(DOMINIO):], r))

    print("IndexNow: %d de %d aceitos." % (ok, len(mudaram)))
    if ok == 0:
        print("IndexNow: nenhum aviso passou. Isso NAO cancela o deploy — o sitemap "
              "continua sendo o caminho principal, e o Google nem usa este protocolo.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        # Rede de seguranca final: erro aqui jamais derruba a publicacao.
        print("IndexNow: falhou sem quebrar o deploy (%s)." % str(e)[:80])
        sys.exit(0)
