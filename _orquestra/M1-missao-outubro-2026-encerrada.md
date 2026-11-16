# Ficha M1 — Microsite ainda vende a missão de outubro de 2026 (16/11/2026)

Papel: maestro + amo-redator (texto) + amo-dados (JSON-LD, llms.txt, sitemap, trava). Rota:
`AMO-EMBARQUE/docs/orquestra/rotas/microsite.md`. Modelo: Ficha A2 do site principal (commits 40eead8 e 24bc54d).
Onde mora esta Ficha: a rota não diz. Fica em `_orquestra/` porque o microsite é servido pelo GitHub Pages
(conferido em 16/11/2026: cabeçalho `server: GitHub.com`), que não publica pasta começada por `_`
(conferido: `/_redirects` responde 404).

```
PEDIDO      Fechar a ponta solta da Ficha A2: o microsite missaocantonfair.com, repositório e deploy próprios,
            ficou de fora e ainda vende a edição de outubro de 2026.
DOR         A missão de outubro de 2026 foi de 21/10 a 05/11/2026 e está encerrada. O title da home é
            "AMO Embarque — Missão Canton Fair 2026 | ...", e há "Vagas limitadas — Missão Canton Fair
            Outubro/2026", "Garantir vaga", "está com vagas abertas", "Quero participar da Missão Canton Fair
            2026". Na linha de base do share-of-answer de 16/11/2026 o Gemini citou o microsite pelo selo
            "Missão Canton Fair 2026". Quem chega pela IA recebe um convite vencido.
RESULTADO   O microsite diz que a edição de outubro de 2026 está encerrada e leva ao grupo de abril de 2027,
            em preparação: https://amoembarque.com/corporativo/canton-fair/missao/ e WhatsApp do Corporativo
            5549998005666. As páginas que documentam a 140ª edição (fases, tecnologias) ficam como registro,
            no passado, com o mesmo endereço.
ROTA        rotas/microsite.md (texto pelo amo-redator; JSON-LD, llms.txt, sitemap e trava pelo amo-dados).
ESCOPO      1. index.html (home): title, description, keywords, og/twitter, H1 (passa a falar de 2027), selo
               do hero, linha de abertura, números do hero, faixas "Vagas limitadas", faixa de marcas
               "140ª Edição — Outubro 2026", seção #fases (passa às fases da 141ª, abril de 2027), links
               para fases/tecnologias (rótulo de registro), linha "Outubro 2026 não dá?", texto do formulário,
               chamada final (.fcta-sec), FAQ visível com 2026 no presente, rodapé "Missão 2026", textos
               pré-preenchidos de WhatsApp e mensagens do quiz/formulário que falam de entrar em 2026.
            2. descubra.html: title, og/twitter, H1 ("Em outubro..."), seção "Outubro 2026 não dá?", opção
               "Outubro 2026" do quiz (sai), datas das fases no resultado do quiz (passam a 2027), texto do
               resultado "Canton Fair Outubro 2026", WhatsApp "Outubro 2026 não vai dar", rodapé.
            3. guia-canton-fair.html (guia perene): title, description, og/twitter, H1, headline → 2027;
               botão "Garantir vaga"; bloco de resposta direta e seção "Datas e fases" → 2027 (140ª no passado);
               CTA "Quer ir à Canton Fair outubro 2026?"; "Missão ... outubro 2026 — vagas limitadas";
               "está com vagas abertas"; visto com 2026 no presente; FAQ "datas da Canton Fair 2026";
               legenda de foto "Missão Canton Fair Outubro 2026"; WhatsApp; rodapé.
            4. fases-canton-fair-outubro-2026.html (registro): title, description ("como garantir presença"),
               og/twitter, H1 e resposta direta no passado e com "encerrada"; CTAs de participar em 2026 →
               grupo de abril de 2027; "o grupo de abril de 2027 já está aberto" → "em preparação"; legenda
               "Missão Brasil saindo de São Paulo"; FAQ de visto no passado; rodapé; WhatsApp.
            5. tecnologias-canton-fair-2026.html (registro): description/og, frases no futuro sobre outubro
               de 2026 ("terá", "vai trazer", "será o palco", "para quem for") viram expectativa registrada
               no passado; CTAs e WhatsApp "garantir minha vaga na missão de outubro" → abril de 2027; nota
               "missão de outubro cobre as Fases 2 e 3"; FAQ; rodapé.
            6. ai-info.html: description, "140ª edição ... Grupo AMO aberto", links do rodapé, data de
               atualização e dateModified.
            7. llms.txt: "Missão Out/2026 em organização", palavras-chave de pacote/missão 2026, rótulo do link
               da missão de 2026 (encerrada) + link para /corporativo/canton-fair/missao/, data de atualização.
            8. JSON-LD de cada página tocada: espelho do texto (headline, description, FAQPage = FAQ visível,
               dateModified = data visível de revisão = 2026-11-16); Event da missão de 2026 sem cara de venda
               aberta e sem offers.
            9. sitemap.xml: lastmod (só por `atualizar_sitemap.py --corrigir`, depois do commit do conteúdo) e
               títulos/legendas de imagem que falem da missão de 2026 como aberta.
NÃO TOCAR   URLs, canonical, robots, `_redirects`, `netlify.toml` · números de WhatsApp e atributos de medição
            (`data-amo-cta`, ids) · lógica de JS além do texto · imagens · `.DS_Store` (modificado e fora
            deste commit) · comentários HTML internos com data · "© 2026" do rodapé (ano do copyright) ·
            números do organizador da 139ª edição · o repositório AMO-EMBARQUE (só leitura).
DECISÕES    - Não afirmar que o grupo de outubro de 2026 viajou, embarcou nem quantos foram: não há fato canônico.
              Redação neutra: "a missão de outubro de 2026 foi de 21/10 a 05/11/2026 e está encerrada".
            - Próxima edição: só o fato canônico (grupo de abril de 2027 em preparação; workshops online sem
              calendário publicado; preparação individual por WhatsApp e e-mail). Destino:
              https://amoembarque.com/corporativo/canton-fair/missao/ e wa.me/5549998005666.
            - Datas da Canton: 15/04 e 15/10, sem "prevista". 2027 = o site principal em /corporativo/canton-fair/
              datas/: 141ª, 15/04 a 05/05/2027 (F1 15–19/04, F2 23–27/04, F3 1º–05/05); 142ª, 15/10 a
              04/11/2027 (F1 15–19/10, F2 23–27/10, F3 31/10–04/11).
            - Isenção de visto: validade declarada até 31/12/2026. Nunca estender a 2027; para 2027, orientação
              caso a caso.
            - Sem "vagas", "garanta", "garantir vaga", "inscrições abertas" ou preço vigente para 2026. Preço de
              julho de 2026 só como registro. Para 2027, nada de preço no microsite.
            - Tecnologias: o que a página dizia sobre outubro de 2026 vira expectativa registrada antes da
              edição ("esperava-se", "o comunicado de 22/09/2026 anunciava"); nada sobre o que a 140ª mostrou.
            - Saída calculada por participante; nunca "saindo de São Paulo" nem "sempre em GRU". Zero emoji.
            - Paridade: o microsite é só do Corporativo; sem espelho no Turismo (registrar no relatório).
PRONTO QUANDO
  - Nenhuma frase do microsite convida a entrar na edição de 2026 (prova por grep, no texto e nos links de
    WhatsApp: "vagas", "vaga", "garant", "inscri", "participar da", "em aberto", "aberto", "Outubro 2026 não",
    "Out/2026", "Missão Canton Fair 2026"; cada ocorrência que restar justificada como registro ou como 2027).
  - Title e H1 da home falam de 2027; `trecho.py` das 6 páginas antes e depois.
  - JSON-LD válido; FAQ visível = FAQPage; dateModified = data visível de revisão (2026-11-16) nas páginas
    com corpo alterado; Event de 2026 sem offers.
  - `python3 validar.py` (do microsite) 0 ERRO; `diff` de amo-crm.js e amo-crm.css com o site principal vazio.
  - Auditor amo-auditor (Opus): APROVADO, no máximo 2 rodadas.
  - Commit local no repositório do microsite, sem push e sem o `.DS_Store`.
```

## Aditivo 1 (maestro, 16/11/2026) — achados da triagem

```
1. Portão da rota reprova: `assets/js/amo-crm.js` do microsite está atrás do site principal (v78 contra v79).
   Falta a correção de 24bc54d: a linha do assunto de /missao-2026/ ("a Missão Canton Fair 2026" → "o grupo
   de abril de 2027 da Canton Fair") e a função `assuntoCrm()`, que o microsite chama na linha 718 sem
   definir. Ação: copiar o arquivo do site principal sem mudança e subir `?v=78` para `?v=79` nas 6 páginas.
   amo-crm.css já é igual.
2. Trava nova (regra 5 do LEIA-PRIMEIRO): esta ponta solta passou pela A2. O `validar.py` do microsite ganha a
   mesma frase proibida que a A2 pôs no site principal, mais as formas próprias do microsite ("Vagas limitadas
   — Missão Canton Fair Outubro/2026", "Out/2026 — Vagas"), para que a edição de outubro de 2026 não volte a
   ser vendida como aberta.
3. Deploy: o microsite é servido pelo GitHub Pages, não pela Netlify. O `netlify.toml` dele não roda: nem
   build, nem `validar.py` como porteiro, nem `atualizar_sitemap.py`, nem IndexNow. Custo de deploy: zero
   crédito da Netlify. Consequência: o sitemap precisa ser corrigido localmente antes do push (commit à parte).
```

## Aditivo 2 (maestro, 16/11/2026) — quiz da descubra com as duas edições de 2027

```
Achado do redator: ao trocar as datas das fases do quiz de outubro de 2026 para abril de 2027, quem marca
"Outubro 2027" passaria a ver a data de abril no resultado e na mensagem do WhatsApp. Sem mexer na lógica do JS,
o texto de data de cada fase passa a citar as duas edições de 2027 (ex.: "15 a 19 de abril ou 15 a 19 de outubro
de 2027") e o rótulo do resultado fica "Canton Fair 2027". Só strings; nenhuma função muda.
```

## Aditivo 3 (maestro, 16/11/2026) — duas frases achadas pelos redatores

```
1. ai-info.html, "Alcance": "Nacional, com saída da missão de São Paulo (GRU)" contradiz a regra de saída calculada
   por participante (e a própria página, mais abaixo) → "Nacional, com saída calculada a partir da cidade de cada
   participante".
2. guia-canton-fair.html, "O que levar": "A Canton Fair acontece em outubro — ... entre 22°C e 30°C" deixa abril de
   fora num guia de 2027 e traz temperatura sem fonte → "A Canton Fair acontece em abril e em outubro, meses de clima
   quente e úmido em Guangzhou."
Ficam de fora e vão ao relatório: imagem/alt/legenda "São Paulo a Guangzhou 12.000 km" (descubra, tecnologias,
sitemap): é distância de um mapa, não afirma saída fixa, e trocar exige mexer em imagem.
```

## Aditivo 4 (maestro, 16/11/2026) — correções da auditoria, rodada 1

```
1. index.html, barra de números do hero: "140ª · 15 Out — 04 Nov · Guangzhou" → "141ª · 15 Abr — 05 Mai · Guangzhou".
2. llms.txt: "De onde o grupo parte? | De São Paulo (GRU), ponto de saída..." e "partida da missão em São Paulo (GRU)"
   → saída calculada a partir da cidade de cada participante. O roteiro da missão de 2025 (registro) fica.
3. guia-canton-fair.html, FAQ de datas (visível e FAQPage): Fase 3 "(Têxtil, Saúde, Esportes)" → "(Têxtil, Saúde,
   Infantil)", como a lista de 2027 do site principal (/corporativo/canton-fair/datas/).
4. fases-canton-fair-outubro-2026.html, CTA da Fase 2: "o grupo de abril de 2027 está em preparação, com foco em casa,
   varejo e consumo" → "Para a Fase 2 (casa, varejo e consumo), o grupo de abril de 2027 está em preparação."
5. validar.py: a trava M1 ganha "grupo aberto para outubro de 2026", "Out/2026 em organização", "inscrições abertas"
   ligado a 2026 e "Missão Canton Fair 2026 — vagas"; trava nova contra saída fixa "São Paulo (GRU)" e cópia da
   trava "saída é sempre em ..." do site principal (sugestão do auditor, rodada 2).
6. Sitemap: o lastmod foi corrigido antes do commit, e não depois. O `atualizar_sitemap.py` compara cada página com o
   HEAD e data a página alterada com a data de hoje (2026-11-16), a mesma que o commit terá; por isso vai num commit só.
```

## Fechamento

Auditor amo-auditor (Opus): REPROVADO na rodada 1 (barra do hero com a 140ª; "São Paulo (GRU)" no llms.txt), APROVADO
na rodada 2. `validar.py`: 0 ERRO, 11 avisos. Cópias de amo-crm.js e amo-crm.css iguais às do site principal.
Fora do escopo, para uma Ficha M2: "15 anos" atribuídos à agência (Organization das 6 páginas, ai-info, llms.txt) e
"+15 anos" sem dono; "12 mil viajantes" sem fato canônico; imagem "12.000 km de São Paulo a Guangzhou"; texto de
WhatsApp fora da trava (URL não decodificada); reconferir a isenção de visto antes de 31/12/2026.
