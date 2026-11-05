/**
 * Recepción de altas de Booking Page.
 *
 * El formulario (tools/intake.html) manda aquí el config cuando el cliente
 * le da Publicar. Esto lo guarda en una hoja, te avisa por correo, y publica
 * el sitio cuando tú apruebas con un clic.
 *
 * QUÉ HAY QUE CONFIGURAR, una sola vez
 * ------------------------------------
 * 1. Crea una hoja de cálculo nueva y copia su id (lo que va entre /d/ y /edit).
 * 2. Extensiones → Apps Script, pega este archivo.
 * 3. Configuración del proyecto → Propiedades del script, agrega:
 *      HOJA_ID        el id de la hoja
 *      GITHUB_TOKEN   token personal de GitHub con permiso repo
 *      GITHUB_REPO    d1eg0dev/booking-engine
 *      AVISO_EMAIL    hellowdstudio@gmail.com
 *      SECRETO        una cadena larga que inventes; protege el enlace de aprobar
 *      AUTO           false  (ponlo en true cuando quieras que publique sin aprobar)
 * 4. Implementar → Nueva implementación → Aplicación web.
 *      Ejecutar como: yo.  Quién tiene acceso: cualquier persona.
 * 5. Copia la URL de la aplicación web y pégala en intake.html, en ALTA_URL.
 *
 * El token de GitHub vive sólo aquí. Nunca en el repo ni en el navegador.
 */

/**
 * Córrela una vez desde el editor, con el botón Ejecutar, y acepta los
 * permisos que pida.
 *
 * Al añadir el guardado de fotos el script empezó a usar Drive, y eso es un
 * permiso nuevo que la autorización anterior no cubría. Google no lo concede
 * solo: hasta que alguien lo acepta, las fotos fallan con "No tienes permiso
 * para llamar a DriveApp". Esto toca las tres cosas que el script necesita
 * —la hoja, Drive y el correo— para que la pantalla de permisos las pida
 * todas de una vez y no haya que volver.
 */
function autoriza() {
  var h = hoja_();
  var c = carpetaFotos_('prueba-de-permisos');
  var correo = Session.getEffectiveUser().getEmail();
  c.setTrashed(true);
  Logger.log('Hoja: ' + h.getName() + ' · Drive: ok · Correo: ' + correo);
  return 'Listo. Ya puedes volver a probar el formulario.';
}

function prop_(nombre, obligatorio) {
  var v = PropertiesService.getScriptProperties().getProperty(nombre);
  if (!v && obligatorio) throw new Error('Falta la propiedad del script: ' + nombre);
  return v || '';
}

function hoja_() {
  var ss = SpreadsheetApp.openById(prop_('HOJA_ID', true));
  var h = ss.getSheetByName('Altas');
  if (!h) {
    h = ss.insertSheet('Altas');
    h.appendRow(['id', 'recibido', 'cliente', 'slug', 'comisionista', 'correo',
                 'estado', 'url', 'config']);
    h.setFrozenRows(1);
  }
  return h;
}

/** Convierte "Casa Larios" en "casa-larios". */
function slugify_(texto) {
  var s = (texto || '').toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // quita acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return s.length >= 3 ? s : '';
}

/** Un slug que no choque con otro ya recibido. */
function slugLibre_(base, hoja) {
  var usados = {};
  hoja.getDataRange().getValues().slice(1).forEach(function (f) { usados[f[3]] = true; });
  if (!usados[base]) return base;
  for (var i = 2; i < 100; i++) {
    var s = (base + '-' + i).slice(0, 40).replace(/-+$/, '');
    if (!usados[s]) return s;
  }
  return base + '-' + Date.now().toString(36);
}

function json_(obj, codigo) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** El formulario manda aquí el config. */
function doPost(e) {
  var bloqueo = LockService.getScriptLock();
  try {
    bloqueo.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'El sistema está ocupado, intenta de nuevo.' });
  }
  try {
    var cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // El workflow avisa aquí cómo acabó el alta. Sin esto la fila se queda en
    // "publicando" para siempre, publique o no, y el estado acaba mintiendo.
    if (cuerpo.accion === 'resultado') return resultado_(cuerpo);
    if (cuerpo.accion === 'foto') return guardaFoto_(cuerpo);

    var cfg = cuerpo.config;
    if (!cfg || typeof cfg !== 'object') {
      return json_({ ok: false, error: 'No llegó la configuración.' });
    }

    var nombre = (cfg.property && cfg.property.name || '').trim();
    var correo = (cfg.contact && cfg.contact.email || '').trim();
    if (!nombre) return json_({ ok: false, error: 'Falta el nombre de la propiedad.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
      return json_({ ok: false, error: 'El correo no parece válido.' });
    }
    var base = slugify_(nombre);
    if (!base) return json_({ ok: false, error: 'El nombre no sirve para formar una dirección.' });

    var h = hoja_();
    var slug = slugLibre_(base, h);
    // La letra delante es a propósito: un id de puros dígitos la hoja lo
    // guarda como número, y uno como "1e234567" lo leería en notación
    // científica. Con una letra siempre es texto.
    var id = 'a' + Utilities.getUuid().replace(/-/g, '').slice(0, 7);
    var comisionista = (cuerpo.codigo || '').toString().trim().toUpperCase().slice(0, 24);
    var auto = prop_('AUTO') === 'true';

    h.appendRow([id, new Date(), nombre, slug, comisionista, correo,
                 auto ? 'publicando' : 'por aprobar', '',
                 JSON.stringify(cfg)]);

    if (auto) {
      dispararAlta_(id, slug, cfg, '');
      avisar_(id, nombre, slug, comisionista, correo, true);
    } else {
      avisar_(id, nombre, slug, comisionista, correo, false);
    }

    return json_({
      ok: true,
      mensaje: auto
        ? 'Listo. Tu página se está creando y te llega un correo en unos minutos.'
        : 'Recibido. Revisamos tu información y te mandamos la página por correo hoy mismo.',
      referencia: id
    });
  } catch (err) {
    return json_({ ok: false, error: 'No pudimos recibir tu información: ' + err.message });
  } finally {
    bloqueo.releaseLock();
  }
}

/** El enlace de aprobar del correo cae aquí. */
/* ── Conectar Stripe ─────────────────────────────────────────────────────
   El propietario le da a un botón, autoriza en Stripe y vuelve. Nosotros
   nunca vemos su clave secreta y su dinero nunca pasa por nuestra cuenta:
   los cobros se crean sobre SU cuenta desde la plataforma, y Stripe le
   liquida a él. La comisión de aplicación es cero: el ingreso es la
   suscripción, no un porcentaje de sus reservas.

   Propiedades del script, una sola vez:
     STRIPE_CLIENT_ID   ca_...   (Stripe → Connect → Configuración)
     STRIPE_SECRET      sk_...   (la de la plataforma, no la de nadie más)
   Y en Stripe, el URI de redirección autorizado tiene que ser la URL /exec
   de este script, exactamente.                                           */

/** Firma el slug para que nadie pueda conectar una cuenta a otro cliente. */
function firma_(slug) {
  var b = Utilities.computeHmacSha256Signature(slug, prop_('SECRETO', true));
  return b.map(function (x) { return ('0' + (x < 0 ? x + 256 : x).toString(16)).slice(-2); }).join('');
}

function vaA_(url, texto) {
  return HtmlService.createHtmlOutput(
    '<p style="font:15px/1.6 -apple-system,sans-serif">' + texto + '</p>' +
    '<script>location.href=' + JSON.stringify(url) + '</script>' +
    '<p style="font:13px/1.6 -apple-system,sans-serif"><a href="' + url + '">Continuar</a></p>');
}

function conectar_(slug) {
  var fila = filaPorSlug_(slug);
  if (!fila) return HtmlService.createHtmlOutput('<p>No encuentro esa propiedad.</p>');
  var url = 'https://connect.stripe.com/oauth/authorize'
    + '?response_type=code&scope=read_write'
    + '&client_id=' + encodeURIComponent(prop_('STRIPE_CLIENT_ID', true))
    + '&state=' + encodeURIComponent(slug + '.' + firma_(slug));
  return vaA_(url, 'Te llevamos a Stripe para conectar tu cuenta…');
}

function regresoStripe_(p) {
  if (p.error) {
    return HtmlService.createHtmlOutput('<p>Stripe canceló la conexión: ' + (p.error_description || p.error) + '</p>');
  }
  var partes = (p.state || '').split('.');
  var slug = partes[0] || '';
  if (!slug || partes[1] !== firma_(slug)) {
    return HtmlService.createHtmlOutput('<p>El enlace no es válido. Vuelve a empezar desde tu correo.</p>');
  }
  var r = UrlFetchApp.fetch('https://connect.stripe.com/oauth/token', {
    method: 'post',
    payload: { grant_type: 'authorization_code', code: p.code || '' },
    headers: { Authorization: 'Bearer ' + prop_('STRIPE_SECRET', true) },
    muteHttpExceptions: true
  });
  var d = JSON.parse(r.getContentText() || '{}');
  if (!d.stripe_user_id) {
    return HtmlService.createHtmlOutput('<p>Stripe no aceptó la conexión: '
      + ((d.error_description || d.error || 'sin detalle')) + '</p>');
  }
  // Sólo se guarda el identificador de su cuenta. El token de acceso no hace
  // falta para cobrar en su nombre y guardarlo sería una llave de más.
  ponStripeEnConfig_(slug, d.stripe_user_id);
  var fila = filaPorSlug_(slug);
  if (fila) hoja_().getRange(fila, 7).setValue('vivo, cobrando');
  MailApp.sendEmail(prop_('AVISO_EMAIL', true), 'Stripe conectado · ' + slug,
    slug + ' conectó su cuenta de Stripe (' + d.stripe_user_id + ').\n' +
    'Su página ya cobra de verdad.\n');
  return HtmlService.createHtmlOutput(
    '<p style="font:15px/1.6 -apple-system,sans-serif"><b>Listo.</b> Tu cuenta de Stripe quedó conectada '
    + 'y tu página ya puede cobrar. El dinero de cada reserva entra directo a tu cuenta.</p>');
}

/** Deja la cuenta conectada en el config del repo del cliente. */
function ponStripeEnConfig_(slug, cuenta) {
  var dueno = prop_('GITHUB_REPO', true).split('/')[0];
  var ruta = 'repos/' + dueno + '/' + slug + '/contents/config.json';
  var actual = JSON.parse(gh_('GET', ruta));
  var cfg = JSON.parse(Utilities.newBlob(Utilities.base64Decode(actual.content)).getDataAsString());
  cfg.payment = cfg.payment || {};
  cfg.payment.mode = 'stripe';
  cfg.payment.stripeAccount = cuenta;
  gh_('PUT', ruta, {
    message: 'Conecta Stripe en ' + slug,
    sha: actual.sha,
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(cfg, null, 2) + '\n').getBytes())
  });
}

function filaPorSlug_(slug) {
  var datos = hoja_().getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) if (String(datos[i][3]).trim() === String(slug).trim()) return i + 1;
  return 0;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.conectar) return conectar_(p.conectar);
  if (p.code || p.error) return regresoStripe_(p);
  if (!p.aprobar) {
    return HtmlService.createHtmlOutput('<p>Recepción de altas de Booking Page.</p>');
  }
  if (p.token !== prop_('SECRETO', true)) {
    return HtmlService.createHtmlOutput('<p>Enlace no válido.</p>');
  }
  var h = hoja_();
  var datos = h.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (!mismoId_(datos[i][0], p.aprobar)) continue;
    if (datos[i][6] !== 'por aprobar') {
      return HtmlService.createHtmlOutput('<p>Esa alta ya está en estado: ' + datos[i][6] + '</p>');
    }
    var slug = datos[i][3];
    var cfg = JSON.parse(datos[i][8]);
    dispararAlta_(String(datos[i][0]), slug, cfg, p.dominio || '');
    h.getRange(i + 1, 7).setValue('publicando');
    return HtmlService.createHtmlOutput(
      '<p>Aprobada: <b>' + datos[i][2] + '</b>.</p>' +
      '<p>En unos minutos estará en https://d1eg0dev.github.io/' + slug + '/</p>');
  }
  return HtmlService.createHtmlOutput('<p>No encuentro esa alta.</p>');
}

/* ── Fotos ───────────────────────────────────────────────────────────────
   El formulario las manda de una en una, ya achicadas por el navegador, en
   cuanto la fila existe. Se guardan en Drive porque en ese momento el repo
   del cliente todavía no se ha creado: se crea al aprobar. Cuando el
   workflow avisa que el sitio quedó, entonces se pasan al repo.           */

function carpetaFotos_(id) {
  var madre, it = DriveApp.getFoldersByName('Fotos de altas · Booking Page');
  madre = it.hasNext() ? it.next() : DriveApp.createFolder('Fotos de altas · Booking Page');
  var h = madre.getFoldersByName(id);
  return h.hasNext() ? h.next() : madre.createFolder(id);
}

function guardaFoto_(c) {
  var id = (c.id || '').toString().trim();
  if (!id) return json_({ ok: false, error: 'falta el id' });
  if (!filaDe_(id)) return json_({ ok: false, error: 'no encuentro esa alta' });

  var m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(c.datos || '');
  if (!m) return json_({ ok: false, error: 'la foto no llegó en un formato que entienda' });
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 6 * 1024 * 1024) {
    return json_({ ok: false, error: 'la foto pesa demasiado' });
  }
  var n = Math.max(1, Math.min(99, parseInt(c.n, 10) || 1));
  var nombre = (n < 10 ? '0' + n : '' + n) + '.jpg';
  var carpeta = carpetaFotos_(id);
  // Si el cliente reintenta, se reemplaza en vez de duplicar.
  var viejas = carpeta.getFilesByName(nombre);
  while (viejas.hasNext()) viejas.next().setTrashed(true);
  carpeta.createFile(Utilities.newBlob(bytes, 'image/jpeg', nombre));
  return json_({ ok: true, n: n });
}

/** Sube las fotos guardadas al repo del cliente y las pone en su config. */
function subeFotos_(id, slug) {
  var carpeta = carpetaFotos_(id);
  var archivos = [], it = carpeta.getFiles();
  while (it.hasNext()) archivos.push(it.next());
  if (!archivos.length) return 0;
  archivos.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });

  var dueno = prop_('GITHUB_REPO', true).split('/')[0];
  var rutas = [];
  for (var i = 0; i < archivos.length; i++) {
    var nombre = archivos[i].getName();
    gh_('PUT', 'repos/' + dueno + '/' + slug + '/contents/fotos/' + nombre, {
      message: 'Fotos de ' + slug,
      content: Utilities.base64Encode(archivos[i].getBlob().getBytes())
    });
    rutas.push('fotos/' + nombre);
  }

  // El config ya está en el repo con photos vacío: se vuelve a escribir con
  // las rutas, y hay que mandar su sha o GitHub rechaza la sobreescritura.
  var ruta = 'repos/' + dueno + '/' + slug + '/contents/config.json';
  var actual = JSON.parse(gh_('GET', ruta));
  var cfg = JSON.parse(Utilities.newBlob(Utilities.base64Decode(actual.content)).getDataAsString());
  cfg.property = cfg.property || {};
  cfg.property.photos = rutas;
  gh_('PUT', ruta, {
    message: 'Fotos de ' + slug,
    sha: actual.sha,
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(cfg, null, 2) + '\n').getBytes())
  });
  return rutas.length;
}

function gh_(metodo, ruta, cuerpo) {
  var o = {
    method: metodo.toLowerCase(),
    headers: { Authorization: 'Bearer ' + prop_('GITHUB_TOKEN', true),
               Accept: 'application/vnd.github+json' },
    muteHttpExceptions: true
  };
  if (cuerpo) { o.contentType = 'application/json'; o.payload = JSON.stringify(cuerpo); }
  var r = UrlFetchApp.fetch('https://api.github.com/' + ruta, o);
  var cod = r.getResponseCode();
  if (cod < 200 || cod >= 300) {
    throw new Error('GitHub ' + cod + ' en ' + ruta + ': ' + r.getContentText().slice(0, 200));
  }
  return r.getContentText();
}

/* Un id como "47094205" sale todo en dígitos (pasa en una de cada 43, porque
   son ocho caracteres hexadecimales) y la hoja lo guarda como número, no como
   texto. Comparar con === contra la cadena fallaba justo en esas altas: ni se
   podían aprobar desde el correo, ni recibían sus fotos, y nadie habría
   entendido por qué unas sí y otras no. */
function mismoId_(a, b) {
  return String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim();
}

function filaDe_(id) {
  var datos = hoja_().getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) if (mismoId_(datos[i][0], id)) return i + 1;
  return 0;
}

/** Cierra la fila: vivo con su dirección, o falló con el motivo. */
function resultado_(c) {
  if (c.token !== prop_('SECRETO', true)) return json_({ ok: false, error: 'no autorizado' });
  var id = (c.id || '').toString().trim();
  if (!id) return json_({ ok: false, error: 'falta el id' });

  var h = hoja_();
  var datos = h.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (!mismoId_(datos[i][0], id)) continue;
    var estado = c.ok ? (c.vivo ? 'vivo' : 'publicando en GitHub')
                      : ('falló: ' + (c.error || 'sin motivo')).slice(0, 240);
    var fotos = 0;
    if (c.ok) {
      // Ahora sí existe el repo, así que las fotos ya tienen a dónde ir. Si
      // esto falla, el sitio igual quedó publicado: se anota y no se pierde.
      try { fotos = subeFotos_(id, datos[i][3]); }
      catch (err) { estado = 'vivo, sin fotos: ' + String(err.message).slice(0, 180); }
    }
    h.getRange(i + 1, 7).setValue(estado);
    if (c.url) h.getRange(i + 1, 8).setValue(c.url);
    if (!c.ok) {
      MailApp.sendEmail(prop_('AVISO_EMAIL', true),
        'Falló el alta · ' + (datos[i][2] || id),
        'El alta de ' + (datos[i][2] || id) + ' no se publicó.\n\n' +
        (c.error || 'sin motivo') + '\n\nRevisa la pestaña Actions del repo del motor.\n');
    } else {
      // El aviso llega aquí, a ti, y no al cliente: el enlace de conectar
      // Stripe se lo reenvías tú con tus palabras. Si algún día quieres que
      // salga solo hacia el cliente, es cambiar el destinatario.
      var enlace = ScriptApp.getService().getUrl() + '?conectar=' + encodeURIComponent(datos[i][3]);
      MailApp.sendEmail(prop_('AVISO_EMAIL', true),
        'Alta publicada · ' + (datos[i][2] || id),
        (datos[i][2] || id) + ' ya está en línea.\n\n' +
        'Sitio: ' + (c.url || '') + '\n' +
        'Fotos publicadas: ' + fotos + '\n' +
        'Correo del cliente: ' + (datos[i][5] || '') + '\n\n' +
        'Para que cobre de verdad, el propietario tiene que conectar su Stripe.\n' +
        'Reenvíale este enlace:\n' + enlace + '\n\n' +
        'Mientras no lo haga, la página sigue en modo demostración y no cobra.\n' +
        ((c.avisos && c.avisos.length) ? '\nRevisar:\n · ' + c.avisos.join('\n · ') + '\n' : ''));
    }
    return json_({ ok: true, fotos: fotos });
  }
  return json_({ ok: false, error: 'no encuentro esa alta' });
}

/** Le dice a GitHub que construya el sitio. */
function dispararAlta_(id, slug, cfg, dominio) {
  var repo = prop_('GITHUB_REPO', true);
  var r = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + prop_('GITHUB_TOKEN', true),
      Accept: 'application/vnd.github+json'
    },
    payload: JSON.stringify({
      event_type: 'alta',
      client_payload: { id: id, slug: slug, config: cfg, domain: dominio || '' }
    }),
    muteHttpExceptions: true
  });
  var codigo = r.getResponseCode();
  if (codigo < 200 || codigo >= 300) {
    throw new Error('GitHub respondió ' + codigo + ': ' + r.getContentText().slice(0, 300));
  }
}

function avisar_(id, nombre, slug, comisionista, correo, yaVa) {
  var destino = prop_('AVISO_EMAIL', true);
  var cuerpo = 'Alta nueva de Booking Page\n\n' +
    'Propiedad: ' + nombre + '\n' +
    'Dirección: ' + slug + '\n' +
    'Correo del cliente: ' + correo + '\n' +
    'Comisionista: ' + (comisionista || 'ninguno, venta directa') + '\n\n';

  if (yaVa) {
    cuerpo += 'Se está publicando sola. No tienes que hacer nada.\n';
  } else {
    var url = ScriptApp.getService().getUrl() +
      '?aprobar=' + encodeURIComponent(id) +
      '&token=' + encodeURIComponent(prop_('SECRETO', true));
    cuerpo += 'Revisa la información en la hoja y publica con este enlace:\n' + url + '\n';
  }
  MailApp.sendEmail(destino, 'Alta nueva · ' + nombre, cuerpo);
}
