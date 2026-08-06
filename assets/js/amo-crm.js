/*!
 * amo-crm.js — rastreador de leads da AMO Embarque
 * Documento de arquitetura: claude/crm_amo_arquitetura.md
 *
 * Regras que NAO podem ser quebradas:
 *  1. Despacho por navigator.sendBeacon. Nunca fetch: o clique no WhatsApp
 *     navega para fora e o navegador cancela requisicao pendente.
 *  2. Blob com type 'text/plain;charset=UTF-8'. Nunca application/json:
 *     dispara preflight CORS que o Apps Script nao responde.
 *  3. Nome e telefone NUNCA vao para o GA4. Só para a planilha.
 *  4. O codigo de comissao e metadado INTERNO. Ele vive no evento e na
 *     planilha, nunca dentro da mensagem que o cliente envia. Quem recebe a
 *     mensagem e o cliente lendo a propria tela: um colchete com codigo ali
 *     parece etiqueta de rastreamento e derruba a confianca do primeiro
 *     contato. A origem "veio do site" viaja na propria frase da mensagem.
 *  5. Sem ENDPOINT configurado nao se gera codigo — codigo sem registro
 *     correspondente seria prova falsa.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- config
  // ------------------------------------------------------------ configuracao
  // Este arquivo roda em DOIS dominios: amoembarque.com, onde o braco sai do
  // caminho da URL e /privacidade/ existe, e missaocantonfair.com, que e
  // corporativo inteiro, nao tem /privacidade/ proprio e mede em duas
  // propriedades do GA4. Manter duas copias divergentes do CRM seria garantir
  // que o primeiro conserto so chegasse em uma delas. Entao o arquivo e UM so,
  // byte a byte igual nos dois repositorios, e o que muda por site e declarado
  // em atributos do <html>:
  //
  //   data-amo-braco="corporativo"      forca o braco (sem isto, sai do caminho)
  //   data-amo-assunto="a missao..."    assunto do WhatsApp quando nao ha rota
  //   data-amo-privacidade="https://..." destino do link do aviso de medicao
  //
  // Sem atributo nenhum, o comportamento e exatamente o de antes.
  var RAIZ = document.documentElement;
  function cfg(nome, padrao) {
    var v = RAIZ && RAIZ.getAttribute('data-amo-' + nome);
    return (v === null || v === undefined || v === '') ? padrao : v;
  }
  var BRACO_FIXO = cfg('braco', '');
  var ASSUNTO_FIXO = cfg('assunto', '');

  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwGwDaoN0STrc_aPpTTD7O8UvaBLNPR832pPh8uod2ep-qYCEu_fQQiirq7ZenSC0CJ/exec';
  var TOKEN = 'amo-2026';          // filtro de ruido, nao seguranca
  var WA_TURISMO = '5549998005666';
  var WA_CORPORATIVO = '5549999380070';
  // A frase carrega a atribuicao: "Vim pelo site" e o sinal de origem que o
  // codigo entre colchetes carregava antes, so que legivel e sem constranger
  // quem envia. O ASSUNTO por caminho existe porque os botoes de menu, rodape
  // e flutuante sao os mesmos em 59 paginas e nao tem como trazer contexto no
  // HTML — quem sabe em que pagina o clique aconteceu e o JS.
  var MSG_BASE = {
    turismo: 'Olá! Vim pelo site da AMO Embarque e quero falar sobre ',
    corporativo: 'Olá! Vim pelo site da AMO Corporativo e quero falar sobre '
  };
  var ASSUNTO_PADRAO = {
    turismo: 'uma viagem',
    corporativo: 'as viagens da minha empresa'
  };
  // Prefixo de caminho -> assunto. Casamento pelo prefixo mais longo.
  var ASSUNTOS = [
    ['/turismo/lua-de-mel/', 'uma lua de mel'],
    ['/turismo/familia/', 'uma viagem em família'],
    ['/turismo/melhor-idade/', 'uma viagem na melhor idade'],
    ['/turismo/japao/', 'uma viagem para o Japão'],
    ['/turismo/viagem-para-mulheres/', 'uma viagem para mulheres'],
    ['/turismo/pacotes/', 'um pacote de viagem saindo de Chapecó'],
    ['/turismo/pacotes/cruzeiros-saindo-de-chapeco/', 'um cruzeiro saindo de Chapecó'],
    ['/turismo/pacotes/roteiros-guiados-em-grupo/', 'os roteiros guiados em grupo saindo de Chapecó'],
    ['/turismo/pacotes/maragogi-saindo-de-chapeco/', 'um pacote para Maragogi saindo de Chapecó'],
    ['/turismo/pacotes/salvador-saindo-de-chapeco/', 'um pacote para Salvador saindo de Chapecó'],
    ['/turismo/pacotes/porto-de-galinhas-saindo-de-chapeco/', 'um pacote para Porto de Galinhas saindo de Chapecó'],
    ['/turismo/pacotes/fortaleza-saindo-de-chapeco/', 'um pacote para Fortaleza saindo de Chapecó'],
    ['/turismo/pacotes/praia-do-forte-saindo-de-chapeco/', 'um pacote para a Praia do Forte saindo de Chapecó'],
    ['/turismo/pacotes/joao-pessoa-saindo-de-chapeco/', 'um pacote para João Pessoa saindo de Chapecó'],
    ['/turismo/pacotes/natal-saindo-de-chapeco/', 'um pacote para Natal saindo de Chapecó'],
    ['/turismo/pacotes/maceio-saindo-de-chapeco/', 'um pacote para Maceió saindo de Chapecó'],
    ['/turismo/pacotes/ilheus-saindo-de-chapeco/', 'um pacote para Ilhéus saindo de Chapecó'],
    ['/turismo/pacotes/cancun-saindo-de-chapeco/', 'um pacote para Cancún saindo de Chapecó'],
    ['/turismo/pacotes/punta-cana-saindo-de-chapeco/', 'um pacote para Punta Cana saindo de Chapecó'],
    ['/turismo/pacotes/disney-orlando-saindo-de-chapeco/', 'um pacote para a Disney saindo de Chapecó'],
    ['/turismo/pacotes/buenos-aires-saindo-de-chapeco/', 'um pacote para Buenos Aires saindo de Chapecó'],
    ['/turismo/pacotes/santiago-chile-saindo-de-chapeco/', 'um pacote para Santiago, no Chile, saindo de Chapecó'],
    ['/corporativo/missoes-empresariais/', 'uma missão empresarial'],
    ['/corporativo/canton-fair/', 'a Missão Canton Fair'],
    ['/corporativo/canton-fair/missao-2026/', 'a Missão Canton Fair 2026'],
    ['/corporativo/canton-fair/missao-abril-2027/', 'a Missão Canton Fair de abril de 2027'],
    ['/corporativo/canton-fair/missao-outubro-2027/', 'a Missão Canton Fair de outubro de 2027'],
    ['/corporativo/canton-fair/visto-e-documentos/', 'visto e documentos para a Canton Fair'],
    ['/corporativo/canton-fair/datas/', 'as datas da Canton Fair'],
    ['/turismo/', 'uma viagem personalizada'],
    ['/turismo/blog/', 'uma viagem'],
    ['/turismo/blog/cidades-subterraneas/', 'uma viagem para conhecer cidades subterrâneas'],
    ['/turismo/blog/clara-concierge-digital/', 'uma viagem com o acompanhamento da Clara'],
    ['/turismo/blog/e-seguro-viajar-sozinha/', 'uma viagem sozinha com segurança'],
    ['/turismo/blog/lua-de-mel-sem-estresse/', 'uma lua de mel'],
    ['/turismo/blog/marrocos-historia-cultura/', 'uma viagem para o Marrocos'],
    ['/turismo/blog/mercados-de-nova-york/', 'uma viagem para Nova York'],
    ['/turismo/blog/primeira-viagem-internacional/', 'a minha primeira viagem internacional'],
    ['/turismo/blog/republica-dominicana-trade-show-2026/', 'uma viagem para a República Dominicana'],
    ['/turismo/blog/viagem-em-familia-sem-carga-mental/', 'uma viagem em família'],
    ['/turismo/blog/viagem-em-grupo-de-mulheres/', 'uma viagem em grupo de mulheres'],
    ['/turismo/blog/viajar-na-melhor-idade/', 'uma viagem na melhor idade'],
    ['/corporativo/', 'a gestão das viagens da minha empresa'],
    ['/corporativo/servicos/', 'os serviços de viagem corporativa'],
    ['/corporativo/agencia-de-viagens-corporativas-chapeco/', 'as viagens da minha empresa em Chapecó'],
    ['/corporativo/blog/', 'as viagens da minha empresa'],
    ['/corporativo/blog/erro-comeca-antes-da-passagem/', 'a política de viagens da minha empresa'],
    ['/corporativo/blog/viagem-corporativa-como-estrategia/', 'as viagens da minha empresa'],
    ['/corporativo/obrigado/', 'as viagens da minha empresa']
  ];
  var CHAVE_V = 'amo_v';           // visitor_id + origem da primeira visita
  var CHAVE_FILA = 'amo_fila';     // eventos que nao sairam
  var CHAVE_POPUP = 'amo_popup';   // captura de segunda chance ja resolvida
  var CHAVE_ULT = 'amo_ult';      // ultimo formulario enviado, para a pagina de obrigado
  var TETO_FILA = 20;
  var VALIDADE_FILA = 7 * 24 * 3600 * 1000;
  var ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I/L

  // ---------------------------------------------------------------- util
  function ls(k, v) {
    try {
      if (v === undefined) return window.localStorage.getItem(k);
      if (v === null) { window.localStorage.removeItem(k); return null; }
      window.localStorage.setItem(k, v); return v;
    } catch (e) { return null; }
  }

  // Guarda de sessao: vive na aba, morre quando ela fecha. Nao e identificador
  // persistente, so preserva a origem da PRIMEIRA pagina dentro da visita.
  function ss(k, v) {
    try {
      if (v === undefined) return window.sessionStorage.getItem(k);
      if (v === null) { window.sessionStorage.removeItem(k); return null; }
      window.sessionStorage.setItem(k, v); return v;
    } catch (e) { return null; }
  }

  // A pessoa so passa a ser identificada depois de enviar um formulario —
  // momento em que ela entrega nome e WhatsApp por vontade propria. Antes
  // disso nada persiste no navegador e nenhum id sai nos eventos.
  function identificado() { return !!ls(CHAVE_V); }

  function hostDe(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  function codigo() {
    var s = '';
    for (var i = 0; i < 5; i++) s += ALFABETO.charAt(Math.floor(Math.random() * ALFABETO.length));
    return 'AMO-' + s;
  }

  // ------------------------------------------------- identidade e origem
  // Gravada na PRIMEIRA visita. Sem isso, quem chega pelo ChatGPT, navega
  // pelo site e so depois clica aparece como origem "amoembarque.com".
  function visitante() {
    var cru = ls(CHAVE_V) || ss(CHAVE_V);
    if (cru) { try { return JSON.parse(cru); } catch (e) { /* regrava */ } }
    var q = new URLSearchParams(location.search);
    var v = {
      id: 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      s: hostDe(document.referrer) || '(direto)',
      u: {
        src: q.get('utm_source') || '',
        med: q.get('utm_medium') || '',
        cmp: q.get('utm_campaign') || ''
      },
      p1: location.pathname,
      t0: new Date().toISOString()
    };
    ss(CHAVE_V, JSON.stringify(v));
    return v;
  }

  // Promove a visita a identificada. Chamado no envio de formulario.
  function identificar() {
    try { if (!ls(CHAVE_V)) ls(CHAVE_V, JSON.stringify(VISITANTE)); } catch (e) {}
  }

  var VISITANTE = visitante();

  function braco() {
    if (BRACO_FIXO) return BRACO_FIXO;
    var p = location.pathname;
    if (p.indexOf('/corporativo') === 0) return 'corporativo';
    if (p.indexOf('/turismo') === 0) return 'turismo';
    return 'institucional';
  }

  // ---------------------------------------------------------------- fila
  function fila() {
    try { return JSON.parse(ls(CHAVE_FILA) || '[]'); } catch (e) { return []; }
  }

  function enfileirar(ev) {
    var f = fila();
    f.push(ev);
    if (f.length > TETO_FILA) f = f.slice(-TETO_FILA);
    ls(CHAVE_FILA, JSON.stringify(f));
  }

  function drenar() {
    var f = fila();
    if (!f.length) return;
    var agora = Date.now();
    var restam = [];
    for (var i = 0; i < f.length; i++) {
      var ev = f[i];
      if (agora - new Date(ev.ts).getTime() > VALIDADE_FILA) continue;
      if (!despachar(ev, true)) restam.push(ev);
    }
    ls(CHAVE_FILA, JSON.stringify(restam));
  }

  // ------------------------------------------------------------ despacho
  function despachar(ev, semRefila) {
    if (!ENDPOINT) return false;
    var ok = false;
    try {
      ok = navigator.sendBeacon(
        ENDPOINT,
        new Blob([JSON.stringify(ev)], { type: 'text/plain;charset=UTF-8' })
      );
    } catch (e) { ok = false; }
    if (!ok && !semRefila) enfileirar(ev);
    return ok;
  }

  function evento(tipo, nome, extras) {
    var ev = {
      k: TOKEN,
      t: tipo,
      n: nome || '(sem-nome)',
      p: location.pathname,
      b: braco(),
      c: (extras && extras.c) || '',
      v: identificado() ? VISITANTE.id : '',
      s: VISITANTE.s,
      u: VISITANTE.u,
      dev: window.matchMedia('(max-width: 820px)').matches ? 'mobile' : 'desktop',
      ts: new Date().toISOString(),
      nome: (extras && extras.nome) || '',
      fone: (extras && extras.fone) || '',
      extra: (extras && extras.extra) || {}
    };
    despachar(ev);
    // Espelha o evento no Umami. Sem cookie, sem identificador: vai so o nome
    // do evento e o contexto de pagina. Se o script nao carregou, nao faz nada.
    try {
      if (window.umami && typeof window.umami.track === 'function') {
        window.umami.track(tipo + ':' + (nome || 'sem-nome'), { pagina: ev.p, braco: ev.b });
      }
    } catch (e) {}
    return ev;
  }

  // --------------------------------------------------- WhatsApp: reescrita
  function numeroDe(href) {
    var m = href.match(/wa\.me\/(\d+)/);
    return m ? m[1] : '';
  }

  // Assunto da pagina atual, pelo prefixo mais longo que casa com o caminho.
  function assuntoDoCaminho(arm) {
    var p = location.pathname;
    var melhor = '';
    var achado = '';
    for (var i = 0; i < ASSUNTOS.length; i++) {
      var pref = ASSUNTOS[i][0];
      if (p.indexOf(pref) === 0 && pref.length > melhor.length) {
        melhor = pref;
        achado = ASSUNTOS[i][1];
      }
    }
    return achado || ASSUNTO_FIXO || ASSUNTO_PADRAO[arm];
  }

  function msgDaPagina(arm) {
    return MSG_BASE[arm] + assuntoDoCaminho(arm) + '.';
  }

  // Higiene: se alguma pagina em cache, link compartilhado ou texto antigo
  // ainda carregar o codigo entre colchetes, ele sai antes de montar a URL.
  function semCodigo(msg) {
    return String(msg).replace(/\s*\[AMO-[A-Z0-9]{5}\]/g, '').trim();
  }

  // Monta a URL do WhatsApp. O codigo de comissao e gerado e registrado no
  // evento, mas NAO entra na mensagem (regra 4 do cabecalho). A ligacao entre
  // o clique e a conversa que chega no WhatsApp e feita na planilha por
  // telefone (quando o cartao de contato foi preenchido) e por proximidade
  // de horario, pagina e botao — que o evento ja carrega.
  // Exposta em window.amoWA para os links gerados por JS (quiz da Canton Fair).
  function urlWhats(href, nomeCta) {
    var num = numeroDe(href) || WA_TURISMO;
    var arm = num === WA_CORPORATIVO ? 'corporativo' : 'turismo';
    var i = href.indexOf('?text=');
    var msg = i > -1 ? semCodigo(decodeURIComponent(href.slice(i + 6))) : '';
    if (!msg) msg = msgDaPagina(arm);
    var cod = ENDPOINT ? codigo() : '';
    evento('cta', nomeCta, { c: cod });
    return {
      url: 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg),
      codigo: cod
    };
  }

  window.amoWA = function (href, nomeCta) {
    return urlWhats(href, nomeCta || 'js-whatsapp').url;
  };

  // ------------------------------------------------------- lead sem <form>
  // O listener de submit abaixo so enxerga formulario que dispara o evento
  // 'submit'. O quiz da Canton Fair nao dispara: o botao e type="button" e o
  // envio e um fetch manual para o Netlify. Resultado ate 02/08/2026 — o lead
  // MAIS RICO do site (nome, WhatsApp, e-mail, empresa, fase de interesse,
  // maturidade de importacao e perfil calculado) nunca chegava na planilha,
  // nao ganhava visitor_id, nao ganhava origem e nao entrava na fila de
  // reenvio: fetch que falhava era engolido num console.error e a pessoa via
  // a tela de sucesso mesmo assim.
  //
  // Esta porta corrige isso sem mexer no desenho do quiz. Quem chama passa o
  // nome do formulario e um objeto plano; a normalizacao de campos e a MESMA
  // do listener de submit, para as duas origens cairem identicas na planilha.
  window.amoLead = function (nomeForm, dados) {
    dados = dados || {};
    var pessoa = '', fone = '', campos = {};
    Object.keys(dados).forEach(function (k) {
      if (k === 'bot-field' || k === 'form-name') return;
      var v = String(dados[k] === null || dados[k] === undefined ? '' : dados[k]).slice(0, 300);
      if (!v) return;
      if (k === 'nome') pessoa = v;
      else if (k === 'whatsapp' || k === 'telefone' || k === 'fone') fone = v;
      else campos[k] = v;
    });
    identificar();
    evento('form', nomeForm || 'lead', { nome: pessoa, fone: fone, extra: campos });
    try {
      ls(CHAVE_ULT, JSON.stringify({ n: pessoa, f: fone, ts: Date.now() }));
    } catch (er) {}
    // Quem ja entregou nome e telefone num formulario completo nao pode
    // receber depois um cartao pedindo nome e telefone. 'enviou' cala para
    // sempre, que e o mesmo tratamento do proprio cartao quando e preenchido.
    ls(CHAVE_POPUP, 'enviou');
    return true;
  };

  // ------------------------------------------------------------- funil
  // Ate 02/08/2026 o quiz da Canton Fair era um funil cego: so o envio
  // gerava evento. Nao havia como saber quantas pessoas abriam, em qual
  // pergunta paravam, nem se algum campo do formulario final estava
  // barrando o envio — ou seja, otimizava-se a pagina no escuro.
  //
  // Contrato: NAO existe quarto tipo de evento. Etapa de funil e um 'cta',
  // exatamente como qualquer botao, com nome no vocabulario padrao
  // <posicao>-<acao>-<detalhe>. Nenhuma coluna nova na aba 'eventos',
  // nenhuma alteracao no Apps Script, nenhuma alteracao no hash_linha.
  //
  // Nome gerado: formulario-form-<funil>-<etapa>.
  // Ler o funil na planilha e filtrar nome_cta que comece com
  // 'formulario-form-<funil>-' e contar por etapa.
  //
  // Abandono NAO tem evento proprio, de proposito. Evento de saida
  // dispararia falso toda vez que o celular manda a aba para segundo plano
  // — inclusive quando a pessoa vai ao WhatsApp e volta. Queda entre etapas
  // se calcula por subtracao, que e exato e nao custa beacon nenhum.
  var FUNIL_VISTO = {};
  window.amoFunil = function (funil, etapa, extra) {
    if (!funil || !etapa) return false;
    var chave = funil + '/' + etapa;
    // Uma vez por carregamento de pagina. Quem volta e avanca de novo nao
    // conta duas vezes: a etapa mede pessoas que chegaram ali, nao cliques.
    if (FUNIL_VISTO[chave]) return false;
    FUNIL_VISTO[chave] = true;
    var campos = {};
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        var v = String(extra[k] === null || extra[k] === undefined ? '' : extra[k]).slice(0, 300);
        if (v) campos[k] = v;
      });
    }
    evento('cta', 'formulario-form-' + funil + '-' + etapa, { extra: campos });
    return true;
  };

  // ---------------------------------------------------------- delegacao
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var nome = a.getAttribute('data-amo-cta') || '';

    // O proprio convite tem um link de WhatsApp dentro. Ele continua sendo
    // medido normalmente, mas nao pode reabrir o cartao que acabou de fechar.
    var dentroDoConvite = !!(a.closest && a.closest('#amo-cap'));

    if (href.indexOf('wa.me') > -1) {
      var r = urlWhats(a.href, nome);
      a.setAttribute('href', r.url);      // o clique segue para a URL nova
      marcarVolta();
      if (!dentroDoConvite) agendarConvite('wa');
      return;
    }
    if (href.indexOf('tel:') === 0) {
      evento('tel', nome);
      if (!dentroDoConvite) agendarConvite('tel');
      return;
    }
  }, false);  // fase de bolha: o href ja pode ser reescrito antes da navegacao

  // ------------------------------------------------------------ formulario
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || f.tagName !== 'FORM') return;
    // O cartao flutuante e o pedido de nome da pagina de obrigado tem envio
    // proprio, com nome de evento e campos certos. Sem esta guarda cada envio
    // do cartao gerava DUAS linhas na planilha: a boa e uma sem nome de CTA,
    // com nome de pessoa e sem telefone — que virava lead fantasma.
    if (f.closest && (f.closest('#amo-cap') || f.closest('.amo-nome'))) return;
    // O atributo name do formulario ja e unico por pagina (lead-pacote-natal,
    // lead-canton-fair-2026...). O data-amo-cta e 'formulario-form' em 48 dos
    // 48 formularios, entao nomear por ele apagava a diferenca entre eles.
    var nome = f.getAttribute('name') || f.getAttribute('data-amo-cta') || '';
    var d = new FormData(f);
    var campos = {}, pessoa = '', fone = '';
    d.forEach(function (v, k) {
      if (k === 'bot-field' || k === 'form-name') return;
      v = String(v).slice(0, 300);
      if (k === 'nome') pessoa = v;
      else if (k === 'whatsapp' || k === 'telefone' || k === 'fone') fone = v;
      else if (k === 'contato') { if (/\d{8,}/.test(v.replace(/\D/g, ''))) fone = v; else campos[k] = v; }
      else campos[k] = v;
    });
    identificar();
    evento('form', nome, { nome: pessoa, fone: fone, extra: campos });
    // Guardado para a pagina de obrigado saber se ficou faltando o nome.
    try {
      ls(CHAVE_ULT, JSON.stringify({ n: pessoa, f: fone, ts: Date.now() }));
    } catch (er) {}
  }, true);

  // --------------------------------------------------- convite de contato
  // Principio de projeto: o visitante nao esta se comprometendo com nada.
  // Ele esta PEDINDO para receber uma coisa de tamanho conhecido. Por isso:
  // telefone e o unico campo obrigatorio, o nome e opcional, o verbo do botao
  // e "Pode mandar" (autorizacao, nao submissao), e existe uma saida visivel
  // escrita — "Agora nao" — alem do X.
  //
  // Disciplina de texto (revisao de 31/07/2026): a versao anterior NOMEAVA
  // cada garantia — "com ideia de investimento", "uma mensagem so", "sem
  // ligacao e sem insistencia". Cada uma era verdadeira e, somadas, viraram
  // um cartao defensivo: quem precisa jurar que nao vai insistir plantou a
  // ideia de que poderia. Ficaram tres linhas curtas — rotulo, pergunta e
  // uma frase de conforto. A promessa de nao insistir agora e cumprida pelo
  // comportamento (uma mensagem, sem ligacao, silencio de 7 dias apos o
  // "Agora nao"), nao declarada no texto.
  var ESPERA_FECHOU = 7 * 24 * 3600 * 1000;   // dispensou: 7 dias de silencio
  var SEM_POPUP = ['/privacidade/', '/obrigada/'];
  var popupAberto = false;
  var entrouEm = Date.now();
  var saiuEm = 0;

  function marcarVolta() { saiuEm = Date.now(); }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // 'enviou' cala para sempre. 'fechou:<carimbo>' cala por 7 dias — dispensar
  // uma vez nao pode significar nunca mais, e insistir na mesma visita seria
  // exatamente o assedio que o texto promete que nao existe.
  function popupBloqueado() {
    var v = ls(CHAVE_POPUP);
    if (!v) return false;
    if (v.indexOf('fechou:') === 0) {
      return (Date.now() - (Number(v.slice(7)) || 0)) < ESPERA_FECHOU;
    }
    return true;
  }

  // O assunto sai do H1 da propria pagina. Em /turismo/lua-de-mel/ o rotulo do
  // cartao diz "AMO - LUA DE MEL", nao "AMO EMBARQUE": a pessoa reconhece que o
  // convite e sobre o que ela estava lendo. A personalizacao cabe em tres
  // palavras de etiqueta em vez de gastar uma frase inteira de promessa.
  function assunto() {
    var h = document.querySelector('h1');
    var t = h ? String(h.textContent || '') : '';
    t = t.split(/[:|—–]/)[0].replace(/\s+/g, ' ').trim();
    if (t.length >= 3 && t.length <= 40) return t;
    return '';
  }

  function rotulo() {
    var a = assunto();
    return a ? 'AMO \u00b7 ' + a : 'AMO Embarque';
  }

  // Valor guardado na planilha: nunca vazio, porque no painel esse campo e o
  // que diz de qual pagina o lead veio sem precisar ler a URL inteira.
  function assuntoCrm() {
    return assunto() || String(document.title || '').split(/[|—–]/)[0].trim() ||
           location.pathname;
  }

  function digitos(s) { return String(s || '').replace(/\D/g, ''); }

  function mascara(s) {
    var d = digitos(s).slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    var corpo = d.slice(2);
    var q = d.length > 10 ? 5 : 4;
    return '(' + d.slice(0, 2) + ') ' + corpo.slice(0, q) +
           (corpo.length > q ? '-' + corpo.slice(q) : '');
  }

  // Telefone errado e lead morto que ainda conta como lead: infla o painel e
  // some na hora de cobrar comissao. Barrar aqui custa um aviso; barrar depois
  // custa a prova.
  function foneValido(s) { var d = digitos(s); return d.length === 10 || d.length === 11; }

  function podeAbrir() {
    if (popupAberto || document.getElementById('amo-cap')) return false;
    if (popupBloqueado()) return false;
    // O aviso trava a captura so enquanto esta em primeiro plano. Antes ele
    for (var i = 0; i < SEM_POPUP.length; i++) {
      if (location.pathname.indexOf(SEM_POPUP[i]) === 0) return false;
    }
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;  // ja digitando
    // Nenhum convite abre por cima de uma captura maior que ja esta aberta.
    // O quiz da Canton Fair pede quatro respostas e so entao os dados; um
    // cartao de duas linhas surgindo por cima dele nao e segunda chance, e
    // concorrencia — e a captura pobre rouba a rica. Guardado por classe no
    // body e por seletor de modal para valer para qualquer quiz futuro.
    if (document.body && document.body.classList.contains('quiz-open')) return false;
    if (document.querySelector('.quiz-modal.open')) return false;
    return true;
  }

  // Gatilho 1 — voltou do WhatsApp sem conversar.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (!saiuEm) return;
    var fora = Date.now() - saiuEm;
    saiuEm = 0;
    if (fora > 300000) return;             // demorou demais: provavelmente conversou
    setTimeout(function () { abrirCaptura('volta'); }, 1200);
  });

  // Gatilho 2 — o ponteiro sobe para fechar a aba, no desktop, depois de 25s.
  document.addEventListener('mouseout', function (e) {
    if (e.clientY > 0 || e.relatedTarget) return;
    if (Date.now() - entrouEm < 25000) return;
    if (window.matchMedia('(max-width: 820px)').matches) return;
    abrirCaptura('saida');
  });

  // Gatilho 3 — leu de verdade: 55% da pagina e 45s dentro dela.
  //
  // Desligado nas paginas que tem quiz proprio. Este e o unico gatilho que
  // mira o leitor ENGAJADO — exatamente a pessoa que deveria estar entrando
  // no quiz. Interceptar essa pessoa com um cartao de dois campos troca um
  // lead de oito campos por um de dois, e foi o que produziu a tela com as
  // duas capturas abertas ao mesmo tempo. Os outros tres gatilhos continuam
  // ativos: todos miram quem esta SAINDO ou quem ja levantou a mao e nao foi
  // atendido, e para esses um pedido curto continua sendo o pedido certo.
  var TEM_QUIZ = !!document.querySelector('.quiz-modal');
  var vigia = setInterval(function () {
    if (TEM_QUIZ) { clearInterval(vigia); return; }
    if (Date.now() - entrouEm < 45000) return;
    var alt = document.documentElement.scrollHeight - window.innerHeight;
    if (alt > 0 && (window.pageYOffset / alt) < 0.55) return;
    // So encerra a vigia quando o convite realmente abriu. Se abrirCaptura
    // recusou (aviso de LGPD na tela, campo em foco), a condicao volta a ser
    // testada daqui a 5s em vez de a chance se perder de vez.
    if (abrirCaptura('leitura')) clearInterval(vigia);
  }, 5000);

  // Gatilho 4 — a pessoa clicou para falar com a gente (WhatsApp ou telefone).
  //
  // Esta e a diferenca de fundo entre este desenho e o de quase todo site: o
  // cartao NAO barra o botao. Quem clica em "Falar no WhatsApp" vai para o
  // WhatsApp na hora, sem passar por formulario nenhum — botao com pedagio na
  // frente e exatamente a sensacao de compromisso que o cartao existe para
  // evitar, e o clique em si ja carrega o codigo [AMO-XXXXX] que garante a
  // atribuicao. O cartao abre logo DEPOIS, na aba que ficou para tras. Quando
  // a pessoa volta ao navegador — em dez segundos ou dez minutos — ele ja esta
  // la. Se a conversa engatou, ela nunca volta e nunca ve o cartao; se nao
  // engatou, o cartao e a segunda chance.
  //
  // Ganho de cobertura: sao 321 botoes de WhatsApp e 130 de telefone no site.
  // Ate aqui nenhum deles abria o convite — so a leitura de 45s, a saida do
  // ponteiro e a volta em menos de 90s. Isto e, o site pedia o contato de quem
  // estava lendo e ignorava quem tinha acabado de levantar a mao.
  //
  // O clique no telefone merece o mesmo tratamento por um motivo proprio: no
  // computador um "tel:" quase sempre nao faz nada visivel. E uma pessoa que
  // quis falar e nao conseguiu.
  function agendarConvite(motivo) {
    var tentativas = 0;
    setTimeout(function tenta() {
      if (abrirCaptura(motivo)) return;
      // Recusou a medicao, ja enviou, dispensou nos ultimos 7 dias ou o cartao
      // ja esta aberto: nao ha nada a repetir.
      if (popupAberto || popupBloqueado()) return;
      // Sobrou o caso temporario — o aviso de medicao ainda na tela nos
      // primeiros segundos da visita. Esse resolve sozinho; vale reesperar.
      if (++tentativas < 4) setTimeout(tenta, 3000);
    }, 900);
  }

  function abrirCaptura(motivo) {
    if (!podeAbrir()) return false;
    popupAberto = true;
    var num = braco() === 'corporativo' ? WA_CORPORATIVO : WA_TURISMO;
    var b = document.createElement('div');
    b.id = 'amo-cap';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Receber as opcoes da AMO no WhatsApp');
    // O titulo muda com o gatilho porque a situacao da pessoa e outra. Quem
    // voltou do WhatsApp sem conversar provavelmente nao foi respondido na
    // hora — para ela a frase certa e "se cair, a gente te chama". Quem esta
    // saindo da pagina ou terminou de ler ainda nao tentou nada, e para essa
    // a frase certa e a pergunta direta.
    var titulo =
      motivo === 'tel' ? 'Se não atender, a gente te chama.' :
      (motivo === 'wa' || motivo === 'volta') ? 'Se cair, a gente te chama.' :
      'Quer as opções no WhatsApp?';
    b.innerHTML =
      '<button type="button" class="amo-cap-x" aria-label="Fechar">&times;</button>' +
      '<p class="amo-cap-marca">' + esc(rotulo()) + '</p>' +
      '<p class="amo-cap-t">' + titulo + '</p>' +
      '<p class="amo-cap-s">Sem compromisso e com atendimento personalizado.</p>' +
      '<form class="amo-cap-f" novalidate>' +
      '<input type="text" name="nome" placeholder="Seu nome (opcional)" aria-label="Seu nome, opcional" autocomplete="given-name">' +
      '<input type="tel" name="fone" placeholder="WhatsApp com DDD" aria-label="Seu WhatsApp com DDD" inputmode="numeric" autocomplete="tel" required>' +
      '<p class="amo-cap-erro" role="alert" hidden>Faltou o DDD ou um número — confere para eu não errar o envio.</p>' +
      '<button type="submit">Pode mandar</button>' +
      '</form>' +
      '<p class="amo-cap-saidas">' +
      (/^(volta|wa|tel)$/.test(motivo) ? '' :
        '<a class="amo-cap-wa" href="https://wa.me/' + num +
        '" data-amo-cta="flutuante-whatsapp-popup">Prefiro chamar eu mesmo</a><span>·</span>') +
      '<button type="button" class="amo-cap-nao">Agora não</button></p>' +
      '<p class="amo-cap-p">Seu número fica só com a AMO. ' +
      '<a href="/privacidade/">Política de privacidade</a>.</p>';
    document.body.appendChild(b);

    function dispensar() {
      ls(CHAVE_POPUP, 'fechou:' + Date.now());
      b.remove(); popupAberto = false;
      document.removeEventListener('keydown', porEsc);
    }
    function porEsc(e) { if (e.key === 'Escape') dispensar(); }
    document.addEventListener('keydown', porEsc);

    b.querySelector('.amo-cap-x').addEventListener('click', dispensar);
    b.querySelector('.amo-cap-nao').addEventListener('click', dispensar);

    // Quem escolhe puxar conversa sozinho ja resolveu o que o popup queria:
    // o link passa pela delegacao de clique, ganha o codigo de comissao e
    // vira evento. So silencia o convite pelos proximos 7 dias.
    var wa = b.querySelector('.amo-cap-wa');
    if (wa) wa.addEventListener('click', function () {
      ls(CHAVE_POPUP, 'fechou:' + Date.now());
      setTimeout(function () { b.remove(); popupAberto = false; }, 120);
    });

    var campoFone = b.querySelector('input[name="fone"]');
    var aviso = b.querySelector('.amo-cap-erro');
    campoFone.addEventListener('input', function () {
      this.value = mascara(this.value);
      if (!aviso.hidden && foneValido(this.value)) aviso.hidden = true;
    });

    // Foco automatico so no desktop. No celular, abrir o teclado sozinho tampa
    // metade da tela e parece cobranca.
    if (!window.matchMedia('(max-width: 820px)').matches) {
      try { b.querySelector('input[name="nome"]').focus({ preventScroll: true }); } catch (e) {}
    }

    b.querySelector('.amo-cap-f').addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!foneValido(campoFone.value)) {
        aviso.hidden = false; campoFone.focus(); return;
      }
      var fd = new FormData(ev.target);
      var pessoa = String(fd.get('nome') || '').slice(0, 120).trim();
      identificar();
    evento('form', 'flutuante-form-' + motivo, {
        nome: pessoa,
        fone: String(fd.get('fone') || '').slice(0, 40),
        extra: { assunto: assuntoCrm() }
      });
      ls(CHAVE_POPUP, 'enviou');
      document.removeEventListener('keydown', porEsc);
      b.innerHTML =
        '<button type="button" class="amo-cap-x" aria-label="Fechar">&times;</button>' +
        '<p class="amo-cap-t">Combinado' + (pessoa ? ', ' + esc(pessoa.split(' ')[0]) : '') + '.</p>' +
        '<p class="amo-cap-s">Mando as opções no seu WhatsApp. Se quiser adiantar, ' +
        '<a href="https://wa.me/' + num + '" data-amo-cta="flutuante-whatsapp-obrigado">fale com a gente agora</a>.</p>';
      b.querySelector('.amo-cap-x').addEventListener('click', function () {
        b.remove(); popupAberto = false;
      });
      setTimeout(function () { b.remove(); popupAberto = false; }, 9000);
    });
    return true;
  }

  // --------------------------------------- nome na pagina de obrigado
  // 42 dos 48 formularios do site pedem um campo so — "Seu WhatsApp ou
  // e-mail". Isso e proposital e converte bem, mas deixa o lead chegando sem
  // nome na planilha, e quem atende comeca a conversa sem saber com quem
  // fala. O lugar de custo zero para pedir o nome e DEPOIS da conversao: a
  // pessoa ja mandou o contato, ja esta na pagina de obrigado, e uma linha a
  // mais ali nao derruba conversao nenhuma porque a conversao ja aconteceu.
  var PAGS_OBRIGADO = ['/obrigada/', '/corporativo/obrigado/'];
  var JANELA_ULT = 15 * 60 * 1000;

  function naPaginaDeObrigado() {
    var p = location.pathname;
    for (var i = 0; i < PAGS_OBRIGADO.length; i++) {
      if (p.indexOf(PAGS_OBRIGADO[i]) === 0) return true;
    }
    return /\/obrigado\/$/.test(p);
  }

  function pedirNome() {
    if (!naPaginaDeObrigado()) return;
    var ult;
    try { ult = JSON.parse(ls(CHAVE_ULT) || 'null'); } catch (e) { ult = null; }
    // Sem envio recente, a pessoa caiu aqui por link direto ou por refresh
    // antigo: pedir o nome do nada seria estranho.
    if (!ult || !ult.ts || Date.now() - ult.ts > JANELA_ULT) return;
    if (ult.n) return;                       // o formulario ja trouxe o nome
    var alvo = document.querySelector('main .lead') ||
               document.querySelector('main p');
    if (!alvo) return;

    var f = document.createElement('form');
    f.className = 'amo-nome';
    f.setAttribute('novalidate', 'novalidate');
    f.innerHTML =
      '<label for="amo-nome-i">Como prefere que a gente te chame?</label>' +
      '<span class="amo-nome-l">' +
      '<input id="amo-nome-i" name="nome" type="text" placeholder="Seu nome" ' +
      'autocomplete="given-name" maxlength="60">' +
      '<button type="submit">Pronto</button></span>';
    alvo.parentNode.insertBefore(f, alvo.nextSibling);

    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var pessoa = String(f.querySelector('input').value || '').trim().slice(0, 60);
      if (!pessoa) { f.querySelector('input').focus(); return; }
      identificar();
    evento('form', 'obrigado-nome', {
        nome: pessoa,
        fone: ult.f || '',
        extra: { assunto: assuntoCrm() }
      });
      ult.n = pessoa;
      try { ls(CHAVE_ULT, JSON.stringify(ult)); } catch (er) {}
      var pronto = document.createElement('p');
      pronto.className = 'amo-nome-ok';
      pronto.textContent = 'Obrigada, ' + pessoa.split(' ')[0] + '. Já anotei aqui.';
      f.parentNode.replaceChild(pronto, f);
    });
  }

  // ------------------------------------------------------- modal de vaga
  // Captura curta (nome + WhatsApp) para o CTA de maior intencao da
  // pagina. Fica no centro da tela com o resto borrado atras, porque
  // quem clicou em "garantir vaga" ja decidiu: aqui o atrito de fechar
  // e menor que o atrito de rolar ate o formulario longo.
  // NAO confundir com o cartao de segunda chance (#amo-cap), que e
  // passivo e continua no canto de proposito: la a pessoa nao pediu
  // nada, e barrar a tela seria cobrar pedagio de quem so esta lendo.
  // O href do CTA aponta para o formulario completo: sem JS, ou para um
  // crawler, o link continua levando a algum lugar util.
  var vagaUltimo = null;
  function vagaEl() { return document.getElementById('amo-vaga'); }

  window.amoAbrirVaga = function (ev) {
    var m = vagaEl();
    if (!m) return;
    if (ev && ev.preventDefault) ev.preventDefault();
    vagaUltimo = document.activeElement;
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
    var f = m.querySelector('input[type="text"]');
    if (f) { setTimeout(function () { f.focus(); }, 70); }
  };

  window.amoFecharVaga = function () {
    var m = vagaEl();
    if (!m) return;
    m.classList.remove('open');
    document.body.style.overflow = '';
    if (vagaUltimo && vagaUltimo.focus) { vagaUltimo.focus(); }
  };

  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    if (e.target.closest('[data-amo-vaga-fechar]')) { window.amoFecharVaga(); return; }
    if (e.target.closest('[data-amo-vaga]')) { window.amoAbrirVaga(e); }
  });

  document.addEventListener('keydown', function (e) {
    var m = vagaEl();
    if (!m || !m.classList.contains('open')) return;
    if (e.key === 'Escape') { window.amoFecharVaga(); return; }
    if (e.key !== 'Tab') return;
    var foc = m.querySelectorAll('a[href],button,input,select,textarea');
    if (!foc.length) return;
    var pri = foc[0], ult = foc[foc.length - 1];
    if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus(); }
    else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus(); }
  });

  // ---------------------------------------------------------------- start
  function iniciar() { drenar(); pedirNome(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
