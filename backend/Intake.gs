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
    var id = Utilities.getUuid().slice(0, 8);
    var comisionista = (cuerpo.codigo || '').toString().trim().toUpperCase().slice(0, 24);
    var auto = prop_('AUTO') === 'true';

    h.appendRow([id, new Date(), nombre, slug, comisionista, correo,
                 auto ? 'publicando' : 'por aprobar', '',
                 JSON.stringify(cfg)]);

    if (auto) {
      dispararAlta_(slug, cfg, '');
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
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.aprobar) {
    return HtmlService.createHtmlOutput('<p>Recepción de altas de Booking Page.</p>');
  }
  if (p.token !== prop_('SECRETO', true)) {
    return HtmlService.createHtmlOutput('<p>Enlace no válido.</p>');
  }
  var h = hoja_();
  var datos = h.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (datos[i][0] !== p.aprobar) continue;
    if (datos[i][6] !== 'por aprobar') {
      return HtmlService.createHtmlOutput('<p>Esa alta ya está en estado: ' + datos[i][6] + '</p>');
    }
    var slug = datos[i][3];
    var cfg = JSON.parse(datos[i][8]);
    dispararAlta_(slug, cfg, p.dominio || '');
    h.getRange(i + 1, 7).setValue('publicando');
    return HtmlService.createHtmlOutput(
      '<p>Aprobada: <b>' + datos[i][2] + '</b>.</p>' +
      '<p>En unos minutos estará en https://d1eg0dev.github.io/' + slug + '/</p>');
  }
  return HtmlService.createHtmlOutput('<p>No encuentro esa alta.</p>');
}

/** Le dice a GitHub que construya el sitio. */
function dispararAlta_(slug, cfg, dominio) {
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
      client_payload: { slug: slug, config: cfg, domain: dominio || '' }
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
