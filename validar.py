#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validar.py — porteiro de deploy da LP missaocantonfair.com.

Roda como build command do Netlify. Sai com codigo 1 quando encontra ERRO,
e o Netlify cancela a publicacao. AVISO nao bloqueia.

A regra que orienta o que e ERRO e o que e AVISO:
  ERRO   = defeito objetivo, ou regressao que custa posicionamento organico.
  AVISO  = qualidade que vale melhorar, mas cuja ausencia nao quebra nada.

Nao precisa de dependencia externa. Python 3.8+.
"""
import os, re, sys, json, glob, collections, datetime, xml.dom.minidom

# ---------------------------------------------------------------- configuracao
DOMINIO = "https://missaocantonfair.com"

# Fatos canonicos. Se um destes mudar na vida real, muda AQUI e o validador
# passa a exigir o valor novo em todo o site. Fonte: fatos_canonicos_amo.md
NAP = {
    "telefone_fixo":  "+55-49-3316-1858",
    "cnpj":           "33.541.159/0001-72",
    "razao_social":   "Agência de Viagens Jamila Umar Ltda",
    "cep":            "89802-211",
    "cidade":         "Chapecó",
}

# Os unicos telefones que podem aparecer no site, so digitos (com 55 na frente).
# Fixo, WhatsApp Turismo e WhatsApp Corporativo. Qualquer outro numero e erro.
TELEFONES = {"554933161858", "5549998005666", "5549999380070"}

# Arquivos que nao sao pagina de conteudo e ficam de fora de quase tudo.
ISENTOS = {"./google06948f8d5d62d0b6.html", "./404.html", "./ai-info.html"}

# Diretorios que o validador nunca percorre.
IGNORAR_DIRS = {".git", "node_modules", "_to_delete", "img", "assets", "site", "build"}

# Tipos de no que representam a empresa. aggregateRating neles e self-serving.
TIPOS_ORG = {"Organization", "LocalBusiness", "TravelAgency", "Corporation", "TravelAgencyBusiness"}

# Emoji de verdade. Nao inclui ★ ✓ → ◆, que sao simbolos usados na marca.
EMOJI = re.compile("[\U0001F000-\U0001FAFF️]")

HOJE = datetime.date.today()

erros, avisos = [], []
def erro(arq, msg):  erros.append((arq, msg))
def aviso(arq, msg): avisos.append((arq, msg))


def paginas_html():
    out = []
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in IGNORAR_DIRS]
        for f in sorted(files):
            if f.endswith(".html"):
                out.append(os.path.join(root, f))
    return out


def caminho_local(url):
    """URL absoluta do proprio dominio -> caminho no disco, ou None se for externa.

    A Netlify serve URL limpa: /corporativo/canton-fair/ai-info responde por
    ai-info.html. Por isso testamos as tres formas antes de dizer que nao existe.
    """
    if not url.startswith(DOMINIO):
        return None
    rel = url[len(DOMINIO):].split("?")[0].split("#")[0]
    candidatos = []
    if rel.endswith("/") or rel == "":
        candidatos.append("." + rel + "index.html")
    else:
        candidatos += ["." + rel, "." + rel + ".html", "." + rel + "/index.html"]
    for c in candidatos:
        if os.path.isfile(c):
            return c
    return candidatos[0]


def blocos_jsonld(texto):
    return re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', texto, re.S)


def nos_do_bloco(dados):
    if isinstance(dados, dict):
        return dados.get("@graph") or [dados]
    if isinstance(dados, list):
        return dados
    return []


def ofertas_recursivas(obj, achados=None):
    """Toda oferta em qualquer profundidade: Offer, AggregateOffer, listas, catalogos."""
    if achados is None:
        achados = []
    if isinstance(obj, dict):
        t = obj.get("@type")
        t = set(t) if isinstance(t, list) else ({t} if t else set())
        if t & {"Offer", "AggregateOffer"} or any(k in obj for k in ("price", "lowPrice", "priceValidUntil")):
            achados.append(obj)
        for v in obj.values():
            ofertas_recursivas(v, achados)
    elif isinstance(obj, list):
        for v in obj:
            ofertas_recursivas(v, achados)
    return achados


def tipos(no):
    t = no.get("@type")
    return set(t) if isinstance(t, list) else ({t} if t else set())


# ----------------------------------------------------------------- verificacao
def main():
    paginas = paginas_html()
    if not paginas:
        print("nenhum HTML encontrado — o validador esta rodando na pasta errada?")
        return 1

    titulos = collections.Counter()
    ids_evento = collections.defaultdict(set)   # @id -> {(start, end)}
    urls_indexaveis = set()

    for p in paginas:
        s = open(p, encoding="utf-8", errors="ignore").read()
        isento = p in ISENTOS

        # --- meta robots -----------------------------------------------------
        m = re.search(r'<meta\s+name="robots"[^>]*content="([^"]*)"', s, re.I)
        conteudo_robots = m.group(1).lower() if m else ""
        indexavel = "noindex" not in conteudo_robots

        if not isento:
            if not m:
                erro(p, 'sem <meta name="robots">. Pagina indexavel precisa declarar, no minimo, '
                        'index, follow, max-image-preview:large — senao o Google so autoriza miniatura pequena.')
            elif indexavel and "max-image-preview:large" not in conteudo_robots:
                erro(p, "meta robots sem max-image-preview:large. Sem isso a pagina perde direito a previa "
                        "de imagem grande no resultado de busca.")

        if not indexavel or isento:
            continue   # daqui pra baixo so vale para pagina que quer ranquear

        # --- basico de SEO ---------------------------------------------------
        t = re.search(r"^<title>(.*?)</title>", s, re.M)
        if not t:
            erro(p, "sem <title>.")
        else:
            titulos[t.group(1)] += 1
            if len(t.group(1)) > 65:
                aviso(p, "title com %d caracteres (o Google corta perto de 60)." % len(t.group(1)))

        if not re.search(r'<meta\s+name="description"', s, re.I):
            erro(p, "sem meta description.")

        canon = re.findall(r'<link[^>]+rel="canonical"[^>]*href="([^"]+)"', s, re.I)
        if not canon:
            erro(p, "sem canonical.")
        elif len(canon) > 1:
            erro(p, "canonical duplicada (%d tags)." % len(canon))
        elif not canon[0].startswith(DOMINIO):
            erro(p, "canonical aponta para fora do dominio: %s" % canon[0])
        else:
            urls_indexaveis.add(canon[0])

        n_h1 = len(re.findall(r"<h1[\s>]", s, re.I))
        if n_h1 != 1:
            aviso(p, "%d tags <h1> (o ideal e exatamente 1)." % n_h1)

        # comentarios saem antes: o texto "<img>" dentro de um <!-- --> nao e uma tag
        sem_comentario = re.sub(r"<!--.*?-->", "", s, flags=re.S)
        for tag in re.finditer(r"<img\b[^>]*>", sem_comentario):
            if "alt=" not in tag.group(0):
                erro(p, "<img> sem alt: %s" % tag.group(0)[:80])

        # --- emoji (regra da marca) -----------------------------------------
        achado = EMOJI.search(s)
        if achado:
            erro(p, "emoji encontrado (%r). A marca usa icones proprios, nunca emoji." % achado.group(0))

        # --- microdata de avaliacao -----------------------------------------
        if 'itemprop="aggregateRating"' in s or "schema.org/AggregateRating" in s:
            erro(p, "microdata de AggregateRating. Avaliacao sobre a propria empresa no proprio site e "
                    "self-serving e inelegivel para review snippet — mantenha a nota so como texto visivel.")

        # --- og:image --------------------------------------------------------
        for og in re.findall(r'<meta property="og:image" content="([^"]+)"', s):
            destino = caminho_local(og)
            if destino and not os.path.isfile(destino):
                erro(p, "og:image aponta para arquivo inexistente: %s" % og)

        # --- JSON-LD ---------------------------------------------------------
        for bruto in blocos_jsonld(s):
            duplicadas = []

            def detector(pares):
                c = collections.Counter(k for k, _ in pares)
                d = [k for k, v in c.items() if v > 1]
                if d:
                    duplicadas.append(d)
                return dict(pares)

            try:
                dados = json.loads(bruto, object_pairs_hook=detector)
            except Exception as e:
                erro(p, "JSON-LD invalido: %s" % e)
                continue
            for d in duplicadas:
                erro(p, "JSON-LD com propriedade unica duplicada: %s. O Google invalida o no inteiro." % d)

            for no in nos_do_bloco(dados):
                if not isinstance(no, dict):
                    continue
                tp = tipos(no)

                if "aggregateRating" in no and (tp & TIPOS_ORG):
                    erro(p, "aggregateRating em no %s. Politica do Google: entidade que controla as "
                            "avaliacoes sobre si mesma e inelegivel." % "/".join(sorted(tp)))

                if "Event" in tp:
                    for obrig in ("name", "startDate", "location"):
                        if obrig not in no:
                            erro(p, "Event '%s' sem propriedade obrigatoria '%s'." % (no.get("name"), obrig))
                    if no.get("@id"):
                        ids_evento[no["@id"]].add((no.get("startDate"), no.get("endDate")))
                    fim = no.get("endDate") or no.get("startDate")
                    if isinstance(fim, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", fim):
                        if datetime.date.fromisoformat(fim) < HOJE:
                            aviso(p, "Event '%s' ja terminou em %s — confirme se ainda deve estar publicado."
                                  % (no.get("name"), fim))

                for img in ([no["image"]] if isinstance(no.get("image"), str) else []):
                    destino = caminho_local(img)
                    if destino and not os.path.isfile(destino):
                        erro(p, "image de schema aponta para arquivo inexistente: %s" % img)

                # offers pode estar aninhada em AggregateOffer, hasOfferCatalog,
                # itemListElement... entao a varredura precisa ser recursiva.
                for of in ofertas_recursivas(no):
                    tem_preco = any(k in of for k in ("price", "lowPrice", "highPrice"))
                    if tem_preco and "priceCurrency" not in of:
                        erro(p, "oferta com preco e sem priceCurrency.")
                    pvu = of.get("priceValidUntil")
                    if isinstance(pvu, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", pvu):
                        if datetime.date.fromisoformat(pvu) < HOJE:
                            erro(p, "priceValidUntil vencido em %s. Preco vencido no ar quebra a promessa "
                                    "de /politica-de-precos/ e sinaliza oferta expirada ao Google." % pvu)

        # --- NAP -------------------------------------------------------------
        for bruto_tel in re.findall(r'(?:tel:|\+55)[\d\-\s\(\)\.]{8,20}', s):
            digitos = re.sub(r"\D", "", bruto_tel)
            if len(digitos) >= 12 and digitos.startswith("55") and digitos[:13] not in TELEFONES:
                erro(p, "telefone %s nao esta na lista de numeros canonicos da AMO." % bruto_tel.strip())
        # formato visivel brasileiro: (49) 3316-1858 / (49) 99938-0070
        for visivel in re.findall(r"\(\d{2}\)\s?\d{4,5}[-\s]?\d{4}", s):
            if "55" + re.sub(r"\D", "", visivel) not in TELEFONES:
                erro(p, "telefone visivel %s nao esta na lista de numeros canonicos da AMO." % visivel)
        for chave in ("cnpj", "razao_social", "cep"):
            valor = NAP[chave]
            marcador = {"cnpj": "CNPJ", "razao_social": "Jamila Umar Ltda", "cep": "89802"}[chave]
            if marcador in s and valor not in s:
                erro(p, "%s divergente do fato canonico (%s)." % (chave, valor))

    # --- titulos repetidos ---------------------------------------------------
    for titulo, n in titulos.items():
        if n > 1:
            erro("(global)", "<title> repetido em %d paginas: %r" % (n, titulo))

    # --- mesmo @id com dados diferentes --------------------------------------
    for ident, datas in ids_evento.items():
        if len(datas) > 1:
            erro("(global)", "@id %s declarado com datas diferentes: %s. Duas verdades para a mesma "
                             "entidade e o que faz a IA nao citar nenhuma." % (ident, sorted(datas)))

    # --- sitemap -------------------------------------------------------------
    if not os.path.isfile("sitemap.xml"):
        erro("(global)", "sitemap.xml nao existe.")
    else:
        bruto = open("sitemap.xml", encoding="utf-8").read()
        try:
            xml.dom.minidom.parseString(bruto)
        except Exception as e:
            erro("sitemap.xml", "XML invalido: %s" % e)
        no_sitemap = set(re.findall(r"<loc>([^<]+)</loc>", bruto))
        for u in sorted(no_sitemap):
            destino = caminho_local(u)
            if destino and not os.path.isfile(destino):
                erro("sitemap.xml", "URL no sitemap sem arquivo correspondente: %s" % u)
        for u in sorted(urls_indexaveis - no_sitemap):
            aviso("sitemap.xml", "pagina indexavel fora do sitemap: %s" % u)
        for img in sorted(set(re.findall(r"<image:loc>([^<]+)</image:loc>", bruto))):
            if not img.startswith(DOMINIO):
                erro("sitemap.xml", "imagem de outro dominio no sitemap: %s" % img)
            elif not os.path.isfile(caminho_local(img)):
                erro("sitemap.xml", "imagem no sitemap sem arquivo: %s" % img)

    # --- robots.txt ----------------------------------------------------------
    if not os.path.isfile("robots.txt"):
        erro("(global)", "robots.txt nao existe.")
    else:
        r = open("robots.txt", encoding="utf-8").read()
        if "Disallow: /" in re.sub(r"Disallow:\s*$", "", r, flags=re.M):
            erro("robots.txt", "existe um Disallow: / — isso tira o site inteiro da busca.")
        if "sitemap.xml" not in r.lower():
            aviso("robots.txt", "nao declara o Sitemap.")
        for bot in ("GPTBot", "PerplexityBot", "ClaudeBot", "Bingbot", "Google-Extended"):
            if bot not in r:
                aviso("robots.txt", "crawler de IA %s nao esta declarado." % bot)

    # --- relatorio -----------------------------------------------------------
    largura = 78
    print("=" * largura)
    print("VALIDADOR AMO — %d paginas verificadas em %s" % (len(paginas), HOJE.isoformat()))
    print("=" * largura)
    if avisos:
        print("\nAVISOS (%d) — nao bloqueiam o deploy:\n" % len(avisos))
        for arq, msg in avisos:
            print("  ~ %s\n      %s" % (arq, msg))
    if erros:
        print("\nERROS (%d) — o deploy foi cancelado:\n" % len(erros))
        for arq, msg in erros:
            print("  X %s\n      %s" % (arq, msg))
        print("\n" + "=" * largura)
        print("REPROVADO. Corrija os %d erros acima e faca push de novo." % len(erros))
        print("=" * largura)
        return 1
    print("\n" + "=" * largura)
    print("APROVADO — nenhum erro. %d aviso(s)." % len(avisos))
    print("=" * largura)
    return 0


if __name__ == "__main__":
    sys.exit(main())
