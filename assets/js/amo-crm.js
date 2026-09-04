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
  //
  // Sem atributo nenhum, o comportamento e exatamente o de antes.
  var RAIZ = document.documentElement;
  function cfg(nome, padrao) {
    var v = RAIZ && RAIZ.getAttribute('data-amo-' + nome);
    return (v === null || v === undefined || v === '') ? padrao : v;
  }
  var BRACO_FIXO = cfg('braco', '');
  var ASSUNTO_FIXO = cfg('assunto', '');
  var MEDIDORES = cfg('ga', 'G-TKW7ZSSV34').split(/[,\s]+/).filter(Boolean);

  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwGwDaoN0STrc_aPpTTD7O8UvaBLNPR832pPh8uod2ep-qYCEu_fQQiirq7ZenSC0CJ/exec';
  var TOKEN = 'amo-2026';          // filtro de ruido, nao seguranca
  var ENDPOINT_V2 = 'https://script.google.com/macros/s/AKfycbzjAb6PCEOYIpfBhZlQCWzSLTptoyY9MqbmUhzwCa7m1Bv7riwonN971Oe0OSHdgeM-Qg/exec';
  var TOKEN_V2 = 'amo-2026-v2';   // espelho para o CRM v2 (dual-post)
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
  // v2 de proposito: o 'sim' colhido em julho veio do aviso antigo, que era
  // opt-out disfarcado de opt-in. Consentimento dado sob aviso defeituoso,
  // para uma tag que desde entao saiu e voltou, nao vale hoje. Chave nova
  // faz todo mundo ser perguntado de novo, sob o aviso correto.
  var CHAVE_CONSENT = 'amo_consent_v2';
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

  function consentiu() { return ls(CHAVE_CONSENT) !== 'nao'; }

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
  // Dominios da casa. Nenhum deles e origem de lead: sao saltos internos entre
  // sites nossos. Registrar "amoembarque.com.br" como fonte foi o defeito
  // medido no GA4 de 31/07 a 27/08, quando o dominio antigo apareceu como a
  // MAIOR fonte do site (125 sessoes, a frente de google/organic com 65 e de
  // chatgpt.com com 22). Nao existe visitante do dominio antigo: existe
  // visitante do ChatGPT e do Google que a ponte antiga mascarava.
  var IRMAOS = [
    'amoembarque.com',
    'amoembarque.com.br',
    'amocorporativo.com.br',
    'missaocantonfair.com'
  ];

  // Ordem de verdade da origem, da mais confiavel para a menos:
  //  1. utm_source na URL (foi alguem, ou o decorarIrmaos, que declarou)
  //  2. referrer de fora de casa (o navegador declarou)
  //  3. referrer de um dominio irmao  -> a origem real se perdeu no salto
  //  4. referrer do proprio dominio   -> navegacao interna
  //  5. sem referrer                  -> direto
  // O campo continua sendo 's' de proposito: o painel ja agrupa por ele, e o
  // conserto tem que aparecer no painel sem depender de mudanca no back-end.
  function origemReal(q) {
    var utm = (q.get('utm_source') || '').trim();
    if (utm) return utm;
    var h = hostDe(document.referrer);
    if (!h) return '(direto)';
    if (h === location.hostname.replace(/^www\./, '')) return '(interno)';
    if (IRMAOS.indexOf(h) > -1) return '(origem perdida)';
    return h;
  }

  function visitante() {
    var cru = ls(CHAVE_V);
    if (cru) { try { return JSON.parse(cru); } catch (e) { /* regrava */ } }
    var q = new URLSearchParams(location.search);
    var v = {
      id: 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      s: origemReal(q),
      u: {
        src: q.get('utm_source') || '',
        med: q.get('utm_medium') || '',
        cmp: q.get('utm_campaign') || ''
      },
      p1: location.pathname,
      t0: new Date().toISOString()
    };
    if (consentiu()) ls(CHAVE_V, JSON.stringify(v));
    return v;
  }

  var VISITANTE = visitante();

  // ------------------------------------------- utm atravessa os dominios
  // Quem chega do ChatGPT no site da missao e clica para amoembarque.com
  // continuava virando "interno": cada dominio tem seu localStorage. Com a
  // UTM reescrita no link, a origem de IA atravessa os dois sites.
  (function decorarIrmaos() {
    try {
      var temUtm = !!(VISITANTE.u && VISITANTE.u.src);

      // A oposicao do art. 18 vale para a empresa, nao para um dominio.
      // localStorage nao atravessa dominio: sem isto, quem desligou a medicao
      // aqui continuaria medido no site irmao. A escolha viaja no link, do
      // mesmo jeito que a utm, e e recebida no head da pagina de destino.
      var optout = false;
      try { optout = window.localStorage.getItem('amo_consent_v2') === 'nao'; } catch (e0) {}

      if (!temUtm && !optout) return;
      var irmaos = IRMAOS;   // mesma lista da origemReal, para nao divergirem
      var aqui = location.hostname.replace(/^www\./, '');
      var as = document.querySelectorAll('a[href]');
      for (var i = 0; i < as.length; i++) {
        var h = as[i].getAttribute('href') || '';
        if (h.indexOf('http') !== 0) continue;
        var host = hostDe(h);
        if (!host || host === aqui || irmaos.indexOf(host) === -1) continue;

        var extra = '';
        // Link que ja carrega utm propria manda mais do que a gente sabe:
        // nao se sobrescreve. A oposicao, essa, entra de qualquer forma.
        if (temUtm && h.indexOf('utm_source=') === -1) {
          extra = 'utm_source=' + encodeURIComponent(VISITANTE.u.src);
          if (VISITANTE.u.med) extra += '&utm_medium=' + encodeURIComponent(VISITANTE.u.med);
          if (VISITANTE.u.cmp) extra += '&utm_campaign=' + encodeURIComponent(VISITANTE.u.cmp);
        }
        if (optout && h.indexOf('amo_optout=') === -1) {
          extra += (extra ? '&' : '') + 'amo_optout=1';
        }
        if (!extra) continue;

        var partes = h.split('#');
        var sep = partes[0].indexOf('?') > -1 ? '&' : '?';
        as[i].setAttribute('href', partes[0] + sep + extra + (partes[1] ? '#' + partes[1] : ''));
      }
    } catch (e) {}
  })();

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
    // Espelho para o CRM v2: token proprio, fora da fila de reenvio.
    // O trilho de prova nao muda; isto so alimenta o painel.
    if (ENDPOINT_V2) {
      try {
        var ev2 = JSON.parse(JSON.stringify(ev));
        ev2.k = TOKEN_V2;
        navigator.sendBeacon(
          ENDPOINT_V2,
          new Blob([JSON.stringify(ev2)], { type: 'text/plain;charset=UTF-8' })
        );
      } catch (e2) {}
    }
    return ok;
  }

  // ------------------------------------------------------------- sinais
  // Perfil passivo do visitante, colhido sem pedir nada: fuso horario,
  // idioma, tela e aparelho vem do navegador; IP e cidade chegam pela
  // ipapi.co, uma vez por sessao, sem bloquear eventos. Se o provedor de
  // IP falhar (bloqueador, cota), os demais sinais ja bastam para situar.
  var SINAIS = null;
  function aparelho() {
    var ua = navigator.userAgent || '';
    var so = 'outro';
    if (/iPad/.test(ua)) so = 'iPad';
    else if (/iPhone/.test(ua)) so = 'iPhone';
    else if (/Android/.test(ua)) so = 'Android';
    else if (/Windows/.test(ua)) so = 'Windows';
    else if (/Mac OS X/.test(ua)) so = 'Mac';
    else if (/Linux/.test(ua)) so = 'Linux';
    var nav = 'navegador';
    if (/Edg\//.test(ua)) nav = 'Edge';
    else if (/Firefox\//.test(ua)) nav = 'Firefox';
    else if (/Chrome\//.test(ua)) nav = 'Chrome';
    else if (/Safari\//.test(ua)) nav = 'Safari';
    return so + ' - ' + nav;
  }
  function sinais() {
    if (!SINAIS) {
      SINAIS = { tz: '', lang: '', tela: '', ap: '', ip: '', cid: '', uf: '' };
      try { SINAIS.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
      try { SINAIS.lang = navigator.language || ''; } catch (e2) {}
      try { SINAIS.tela = String(screen.width) + 'x' + String(screen.height); } catch (e3) {}
      SINAIS.ap = aparelho();
      try {
        var cache = window.sessionStorage.getItem('amo_ip');
        if (cache) {
          var cj = JSON.parse(cache);
          SINAIS.ip = cj.ip || ''; SINAIS.cid = cj.cid || ''; SINAIS.uf = cj.uf || '';
        } else if (window.fetch) {
          window.fetch('https://ipapi.co/json/', { mode: 'cors' })
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (!j || !j.ip) return;
              SINAIS.ip = String(j.ip).slice(0, 45);
              SINAIS.cid = String(j.city || '').slice(0, 60);
              SINAIS.uf = String(j.region_code || j.region || '').slice(0, 30);
              try {
                window.sessionStorage.setItem('amo_ip', JSON.stringify({ ip: SINAIS.ip, cid: SINAIS.cid, uf: SINAIS.uf }));
              } catch (e4) {}
              // A cidade chega ~1s DEPOIS do pageview. Sem este aviso, o
              // cartao do Espiao nascia sem cidade/UF e so se corrigia no
              // proximo evento. O re-envio deduplica o trajeto (mesma URL)
              // e so atualiza os sinais do cartao.
              try { if (window.__amoPvRefresh) window.__amoPvRefresh(); } catch (e6) {}
            })
            .catch(function () {});
        }
      } catch (e5) {}
    }
    return SINAIS;
  }

  function evento(tipo, nome, extras) {
    var ev = {
      k: TOKEN,
      t: tipo,
      n: nome || '(sem-nome)',
      p: location.pathname,
      b: braco(),
      c: (extras && extras.c) || '',
      v: consentiu() ? VISITANTE.id : '',
      s: VISITANTE.s,
      u: VISITANTE.u,
      sig: sinais(),
      dev: window.matchMedia('(max-width: 820px)').matches ? 'mobile' : 'desktop',
      ts: new Date().toISOString(),
      nome: (extras && extras.nome) || '',
      fone: (extras && extras.fone) || '',
      extra: (extras && extras.extra) || {}
    };
    despachar(ev);
    // semEspelho: eventos passivos do Espiao (pageview, tempo, abandono) NAO
    // vao para Umami/GA4 — la cada propriedade custa cota, e pageview o
    // Umami ja mede sozinho. Eles existem so para a planilha e o Telegram.
    if (!(extras && extras.semEspelho)) espelhar(tipo, nome || 'sem-nome');
    return ev;
  }

  // Espelho do trilho de prova na camada de medicao. Sem cookie, sem
  // identificador, sem nome e sem telefone: vai o nome do evento e o botao.
  //
  // Duas correcoes de 15/08/2026 em relacao a versao anterior:
  //
  //  1. A propriedade 'pagina' saiu. O Umami ja guarda a URL de cada evento
  //     por conta propria — mandar o caminho de novo era pagar duas vezes
  //     pelo mesmo dado. E o plano cobra CADA PROPRIEDADE como um evento:
  //     track(nome, {pagina, braco}) custava 3 unidades de cota, sendo que
  //     uma delas era copia do que ja vinha de graca.
  //
  //  2. O nome deixou de ser 'cta:hero-whatsapp' e virou 'contato_whatsapp'
  //     com o botao em propriedade. Nome de evento com detalhe ilimitado
  //     dentro cria um evento novo a cada botao do site: em seis meses sao
  //     centenas de series de uma linha cada e nenhuma pergunta respondida.
  //     Detalhe ilimitado vive em propriedade; o nome fica no vocabulario
  //     fechado, que e o que permite perguntar "quantos contatos no total".
  function espelhar(tipo, nome) {
    var evt, props;
    if (tipo === 'tel') { evt = 'contato_telefone'; props = { botao: nome }; }
    else if (tipo === 'form') { evt = 'formulario_enviado'; props = { formulario: nome }; }
    else if (nome.indexOf('formulario-form-') === 0) {
      evt = 'funil_etapa'; props = { etapa: nome.slice(16) };
    } else { evt = 'contato_whatsapp'; props = { botao: nome }; }
    try {
      // A camada de medicao aplica o teto e o espelho no GA4 num lugar so.
      if (typeof window.amoMedir === 'function') { window.amoMedir(evt, props, true); }
      else {
        // Se ela nao carregou, o espelho nao pode sumir junto.
        if (window.umami && typeof window.umami.track === 'function') window.umami.track(evt, props);
        if (typeof window.gtag === 'function') window.gtag('event', evt, props);
      }
      espelharLead(evt);
    } catch (e) {}
  }

  // O GA4 tem vocabulario proprio para lead, e a familia de relatorios "Geracao
  // de leads" so enxerga esse vocabulario: generate_lead, qualify_lead,
  // disqualify_lead. Nenhum nome nosso entra la, por melhor que seja. Por isso
  // o gesto de contato passa a sair com DOIS nomes: 'contato_whatsapp' responde
  // "qual botao converteu" e 'generate_lead' responde ao Google.
  //
  // A armadilha que isso cria, escrita aqui para quem abrir o arquivo daqui a
  // seis meses: SOMAR os dois conta o mesmo contato duas vezes. Por isso o
  // segundo evento carrega 'metodo' com o nome do primeiro, e nao carrega mais
  // nada: ele existe para o Google, nao para a nossa leitura.
  //
  // E so no GA4 de proposito. O Umami cobra por evento E por propriedade, e o
  // segundo nome nao responde nada que o primeiro ja nao responda la.
  var EVENTO_E_LEAD = { contato_whatsapp: 1, contato_telefone: 1, formulario_enviado: 1 };
  function espelharLead(evt) {
    if (!EVENTO_E_LEAD[evt]) return;
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'generate_lead', { metodo: evt });
      }
    } catch (e) {}
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
    // Auto-identificacao (CRO): toda conversa chega com nome quando a
    // pessoa completa a frase antes de enviar — sem formulario, sem atrito.
    // Texto proprio que ja pede nome (quiz da Canton Fair) nao duplica.
    msg = msg.replace(/\s+$/, '');
    if (msg && msg.charAt(msg.length - 1) !== '.') msg += '.';
    if (msg.toLowerCase().indexOf('chamo') === -1) msg += ' Me chamo ';
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
    evento('form', nomeForm || 'lead', { nome: pessoa, fone: fone, extra: campos });
    try {
      ls(CHAVE_ULT, JSON.stringify({ n: pessoa, f: fone, ts: Date.now() }));
    } catch (er) {}
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

    if (href.indexOf('wa.me') > -1) {
      var r = urlWhats(a.href, nome);
      a.setAttribute('href', r.url);      // o clique segue para a URL nova
      return;
    }
    if (href.indexOf('tel:') === 0) {
      evento('tel', nome);
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
    evento('form', nome, { nome: pessoa, fone: fone, extra: campos });
    // Espiao: este formulario foi concluido — nao e abandono (ver secao espiao).
    try { if (typeof FORMS_ESP !== 'undefined' && FORMS_ESP[nome]) FORMS_ESP[nome].enviado = true; } catch (er2) {}
    // Guardado para a pagina de obrigado saber se ficou faltando o nome.
    try {
      ls(CHAVE_ULT, JSON.stringify({ n: pessoa, f: fone, ts: Date.now() }));
    } catch (er) {}
  }, true);

  // --------------------------------------------------- convite de contato
  // REMOVIDO em 04/09/2026 a pedido do dono: o cartao flutuante de segunda
  // chance renderizava quebrado no celular (transparente, texto sobreposto,
  // tampa a tela) e a captura passiva se mostrou falha. O rastreamento de
  // cliques e formularios continua intacto; uma captura nova sera desenhada
  // do zero, com oferta real, quando formos aplicar CRO de verdade.
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

  // ------------------------------------------------- oposicao a medicao
  // A barra de consentimento SAIU em 16/08/2026, e ela so pode sair porque o
  // que a obrigava saiu junto: o <head> agora carrega o GA4 com
  // analytics_storage NEGADO e sem nenhum caminho que conceda. Sem cookie e
  // sem identificador de navegador, nao ha permissao a pedir — a base e o
  // legitimo interesse (LGPD art. 7, IX), nao o consentimento.
  //
  // O que legitimo interesse cobra em troca e o DIREITO DE SE OPOR (art. 18).
  // Oposicao que so existe no texto da politica nao e oposicao. Por isso este
  // bloco: um botao real, em /privacidade/, que desliga o GA4 neste navegador
  // agora e nas proximas visitas (a guarda do <head> le a mesma chave).
  //
  // Note que ele NAO desliga o Umami: o Umami nao grava nada no navegador e
  // nao distingue uma pessoa da outra. Nao ha dado pessoal ali para se opor,
  // e prometer desligar o que nao trata dado seria teatro.
  function aplicarRecusa() {
    // Um site pode reportar para mais de uma propriedade. Recusar a medicao e
    // uma escolha sobre SER medido, nao sobre uma propriedade especifica:
    // desligar so a primeira deixaria a segunda gravando.
    try {
      for (var i = 0; i < MEDIDORES.length; i++) {
        window['ga-disable-' + MEDIDORES[i]] = true;
      }
    } catch (e) {}
    ls(CHAVE_V, null);
    ls(CHAVE_FILA, null);
  }

  function textoOptout(el, desligado) {
    el.textContent = desligado
      ? 'Voltar a permitir a medi\u00e7\u00e3o'
      : 'N\u00e3o quero ser medido neste site';
    el.setAttribute('aria-pressed', desligado ? 'true' : 'false');
  }

  function ligarOptout() {
    var bt = document.querySelector('[data-amo-optout]');
    if (!bt) return;
    var estado = document.getElementById('amo-optout-estado');
    function pintar() {
      var desligado = ls(CHAVE_CONSENT) === 'nao';
      textoOptout(bt, desligado);
      if (estado) {
        estado.textContent = desligado
          ? 'A medi\u00e7\u00e3o est\u00e1 DESLIGADA neste navegador.'
          : 'A medi\u00e7\u00e3o est\u00e1 ligada neste navegador.';
      }
    }
    pintar();
    bt.addEventListener('click', function () {
      var desligado = ls(CHAVE_CONSENT) === 'nao';
      if (desligado) {
        ls(CHAVE_CONSENT, null);
        // Nao da para "religar" o ga-disable nesta carga sem recarregar a
        // pagina: a flag ja foi lida. Dizer a verdade custa uma frase.
        if (estado) {
          estado.textContent = 'Pronto. A medi\u00e7\u00e3o volta a valer no pr\u00f3ximo carregamento desta p\u00e1gina.';
        }
        textoOptout(bt, false);
      } else {
        ls(CHAVE_CONSENT, 'nao');
        aplicarRecusa();
        pintar();
      }
    });
  }


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

  // ------------------------------------------------------------- espiao
  // Eventos passivos que alimentam o "Espiao - Amo Embarque" (Telegram).
  // Nenhum deles vai para Umami/GA4 (semEspelho) — custariam cota sem
  // responder pergunta nova la. Eles existem para a planilha e para o
  // cartao em tempo real de cada visitante no grupo do Telegram.
  //
  // O que sai daqui:
  //   t='pv'        uma por carregamento de pagina — e o que permite montar
  //                 o trajeto "x > y > z" com links clicaveis no Telegram.
  //   t='tempo'     marcos de leitura engajada (aba visivel): 1, 5 e 10 min.
  //   t='funil'     'form-aberto-<nome>' no primeiro foco num campo.
  //   t='abandono'  'form-abandonado-<nome>' / 'quiz-abandonado-<funil>' no
  //                 pagehide: saiu da pagina com o formulario sujo ou com o
  //                 quiz aberto sem ter enviado. pagehide + sendBeacon e o
  //                 par que sobrevive a saida; visibilitychange dispararia
  //                 falso toda vez que o celular vai ao WhatsApp e volta.
  var FORMS_ESP = {};          // nome -> { sujo, enviado }
  var QUIZ_ESP = { aberto: '', enviou: {} };

  function nomeFormulario(f) {
    return f.getAttribute('name') || f.getAttribute('data-amo-cta') || 'form-sem-nome';
  }

  // Robos que executam JS (Googlebot renderiza paginas e dispara beacons)
  // nao sao visitantes: sem este filtro, cada rastreio vira cartao no
  // Telegram e linha no CRM. Vale so para os eventos passivos do espiao —
  // o trilho de prova (cta/form/tel) ja e filtrado pela natureza do gesto.
  var EH_ROBO = (function () {
    try {
      if (navigator.webdriver) return true;
      return /bot|crawl|spider|slurp|headless|lighthouse|pingdom|facebookexternal/i
        .test(navigator.userAgent || '');
    } catch (e) { return false; }
  })();

  function espiaoPassivo(tipo, nome, extra) {
    if (EH_ROBO) return;
    evento(tipo, nome, { extra: extra || {}, semEspelho: true });
  }

  // pageview com URL completa — o Telegram precisa dela para o link clicavel.
  function espiaoPageview() {
    espiaoPassivo('pv', location.pathname, {
      url: location.href,
      titulo: String(document.title || '').split(/[|—–]/)[0].trim().slice(0, 120)
    });
  }
  // Chamada quando a cidade/UF chega (ipapi resolve depois do pageview).
  window.__amoPvRefresh = function () { espiaoPageview(); };

  // Tempo de leitura engajado: so conta com a aba visivel. Quem abre e troca
  // de aba nao "le" 10 minutos.
  function espiaoTempo() {
    var marcos = [[60, '1min'], [300, '5min'], [600, '10min']];
    var idx = 0, acum = 0, tick = Date.now();
    setInterval(function () {
      var agora = Date.now();
      if (document.visibilityState === 'visible') acum += agora - tick;
      tick = agora;
      if (idx < marcos.length && acum >= marcos[idx][0] * 1000) {
        espiaoPassivo('tempo', marcos[idx][1]);
        idx++;
      }
    }, 5000);
  }

  // Formulario aberto: primeiro foco em qualquer campo de um <form> real
  // (o cartao #amo-cap e o pedido de nome da pagina de obrigado tem trilha
  // propria e ficam de fora). Uma vez por formulario por pagina.
  document.addEventListener('focusin', function (e) {
    var f = e.target && e.target.closest && e.target.closest('form');
    if (!f) return;
    if (f.closest('#amo-cap') || f.closest('.amo-nome')) return;
    var nome = nomeFormulario(f);
    if (FORMS_ESP[nome]) return;
    FORMS_ESP[nome] = { sujo: false, enviado: false };
    espiaoPassivo('funil', 'form-aberto-' + nome);
  }, true);

  document.addEventListener('input', function (e) {
    var f = e.target && e.target.closest && e.target.closest('form');
    if (!f || (f.closest('#amo-cap') || f.closest('.amo-nome'))) return;
    var nome = nomeFormulario(f);
    if (FORMS_ESP[nome]) FORMS_ESP[nome].sujo = true;
  }, true);

  // Quiz/diagnostico: o amoFunil ja registra 'abriu' e 'enviou'. Embrulhar
  // aqui da ao espiao o estado "aberto e nao enviado" sem tocar nas paginas.
  var amoFunilBase = window.amoFunil;
  window.amoFunil = function (funil, etapa, extra) {
    try {
      if (etapa === 'abriu') QUIZ_ESP.aberto = funil;
      if (etapa === 'enviou') QUIZ_ESP.enviou[funil] = true;
    } catch (e) {}
    return amoFunilBase(funil, etapa, extra);
  };

  // Abandono real: a pagina esta sendo descarregada. Quiz aberto sem envio,
  // ou formulario com digitacao sem submit.
  window.addEventListener('pagehide', function () {
    try {
      if (QUIZ_ESP.aberto && !QUIZ_ESP.enviou[QUIZ_ESP.aberto]) {
        espiaoPassivo('abandono', 'quiz-abandonado-' + QUIZ_ESP.aberto);
        QUIZ_ESP.aberto = ''; // pagehide pode repetir em navegadores com bfcache
      }
      Object.keys(FORMS_ESP).forEach(function (nome) {
        var f = FORMS_ESP[nome];
        if (f.sujo && !f.enviado) {
          espiaoPassivo('abandono', 'form-abandonado-' + nome);
          f.enviado = true; // idem: nao repete se a pagina voltar do bfcache
        }
      });
    } catch (e) {}
  });


  function iniciar() { drenar(); pedirNome(); ligarOptout(); espiaoPageview(); espiaoTempo(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
