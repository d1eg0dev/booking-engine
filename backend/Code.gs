/**
 * Backend de reservas, compartido por TODOS los clientes.
 *
 * Antes había un proyecto de Apps Script por propiedad, pegado a su hoja.
 * Eso significaba que dar de alta a alguien exigía crear y desplegar un
 * proyecto a mano, y que corregir un error de cálculo obligaba a redesplegar
 * tantas veces como clientes hubiera. Ahora hay una sola implementación y
 * una sola URL: cada petición trae el slug del cliente y de ahí se resuelve
 * su configuración y su hoja.
 *
 * Aislamiento: el id de la hoja NO viaja en la petición. La página sólo
 * manda el slug, y el id se busca en el registro de altas, que es nuestro.
 * Así nadie puede pedirle a este backend que abra una hoja que no hayamos
 * dado de alta, por mucho que se invente un slug.
 *
 * Propiedades del script:
 *   REGISTRO_ID        id de la hoja de altas (la misma de backend/Intake.gs)
 *   STRIPE_SECRET_KEY  clave de la plataforma; el cobro se hace sobre la
 *                      cuenta del propietario con la cabecera Stripe-Account
 *   OWNER_EMAIL        opcional, sólo como destino de respaldo
 */

var DOMINIO_BASE = 'wdstudio.agency';
var SLUG_OK = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

var SHEET_BOOKINGS = 'Reservas';
var SHEET_BLOCKS = 'Bloqueos';
var HEADERS = ['Creada', 'Referencia', 'Estado', 'Nombre', 'Correo', 'Teléfono', 'Entrada', 'Salida', 'Noches', 'Huéspedes', 'Mascotas', 'Extras', 'Total', 'Cobrado hoy', 'Moneda', 'Idioma', 'Notas', 'Stripe session', 'Recuperación enviada', 'URL de regreso'];

/* ---------- entradas ---------- */
/* El cliente viaja como ?cliente= y no como ?c=. Google se reserva «c» en las
   URLs /macros/s/ y responde su propia página de error con un 400 antes de
   que la petición llegue al script, así que no hay forma de depurarlo desde
   aquí: el registro de ejecuciones se queda vacío. Si alguna vez hay que
   acortarlo, probar el nombre nuevo en el navegador antes de publicarlo. */
function doGet(e) {
  var a = (e.parameter.action || '');
  try {
    if (!a) return json({ ok: true });            // sonda de vida, sin cliente
    abre_(e.parameter.cliente);
    if (a === 'availability') return json({ blocked: blockedDates() });
    if (a === 'confirm') return json(confirmSession(e.parameter.session_id));
    return json({ ok: true });
  } catch (err) { return json({ error: String(err) }); }
}

function doPost(e) {
  var a = (e.parameter.action || '');
  /* El cerrojo es de todo el script, así que ahora serializa a todos los
     clientes y no sólo a uno. Se coge DESPUÉS de resolver el cliente y se
     suelta enseguida: lo que protege es el momento de escribir la reserva,
     que es donde dos peticiones podrían pisarse las mismas fechas. */
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    abre_(e.parameter.cliente);
    var body = JSON.parse(e.postData.contents || '{}');
    if (a === 'book') return json(createBooking(body));
    if (a === 'lead') return json(createLead(body));
    return json({ error: 'action' });
  } catch (err) { return json({ error: String(err) }); }
  finally { lock.releaseLock(); }
}

/* ---------- configuración ---------- */
function prop(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
/* Con Stripe Connect el cobro se crea sobre la cuenta del propietario: la
   clave es la de la plataforma y la cabecera dice de quién es el dinero.
   Stripe le liquida a él; por aquí no pasa. Sin stripeAccount se comporta
   como antes, con la clave propia del cliente, para no romper a quien ya
   estuviera cobrando así. */
function cabecerasStripe_(cfg) {
  var h = { Authorization: 'Bearer ' + prop('STRIPE_SECRET_KEY') };
  var cuenta = cfg && cfg.payment && cfg.payment.stripeAccount;
  if (cuenta) h['Stripe-Account'] = cuenta;
  return h;
}

function config() {
  if (!CTX) throw new Error('sin cliente');
  return CTX.cfg;
}
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- de quién es esta petición ---------- */
/* CTX dura lo que dura la ejecución. Cada llamada al web app arranca de
   cero, así que no hay forma de que el contexto de un cliente sobreviva a
   la petición de otro. */
var CTX = null;

function abre_(slug) {
  if (!SLUG_OK.test(String(slug || ''))) throw new Error('cliente no válido');
  var cache = CacheService.getScriptCache();

  /* Las claves de caché llevan el slug. Sin eso, el primer cliente que
     pidiera disponibilidad dejaría SUS fechas bloqueadas en la caché y el
     siguiente las leería como propias: justo la mezcla que este diseño no
     se puede permitir. */
  var kCfg = 'cfg_' + slug, hit = cache.get(kCfg), cfg;
  if (hit) { cfg = JSON.parse(hit); }
  else {
    var url = 'https://' + slug + '.' + DOMINIO_BASE + '/config.json?t=' + Date.now();
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('no se pudo leer la configuración de ' + slug);
    cfg = JSON.parse(r.getContentText());
    cache.put(kCfg, r.getContentText(), 300);
  }

  var kHoja = 'hoja_' + slug, idHoja = cache.get(kHoja);
  if (!idHoja) {
    idHoja = buscaHoja_(slug);
    if (!idHoja) throw new Error('ese cliente no tiene hoja registrada');
    cache.put(kHoja, idHoja, 1800);
  }

  CTX = { slug: slug, cfg: cfg, ss: SpreadsheetApp.openById(idHoja) };
  return CTX;
}

/** Busca en el registro de altas la hoja que le toca a un slug. */
function buscaHoja_(slug) {
  var reg = SpreadsheetApp.openById(prop('REGISTRO_ID')).getSheets()[0];
  var datos = reg.getDataRange().getValues();
  var cab = datos[0].map(function (c) { return String(c).trim().toLowerCase(); });
  var cSlug = cab.indexOf('slug'), cHoja = cab.indexOf('hoja del cliente');
  if (cSlug === -1 || cHoja === -1) return '';
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][cSlug]).trim() !== slug) continue;
    var m = String(datos[i][cHoja] || '').match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
  }
  return '';
}

function sheet(name) { return CTX.ss.getSheetByName(name); }

/* ---------- disponibilidad ---------- */
function blockedDates() {
  var cache = CacheService.getScriptCache(), kB = 'blocked_' + CTX.slug, hit = cache.get(kB);
  if (hit) return JSON.parse(hit);
  var cfg = config(), set = {};
  function addRange(from, to) { BookingPricing.dayList(from, to).forEach(function (d) { set[d] = 1; }); }

  ((cfg.availability && cfg.availability.icalUrls) || []).forEach(function (url) {
    try {
      var txt = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
      txt.split('BEGIN:VEVENT').slice(1).forEach(function (ev) {
        var s = (ev.match(/DTSTART[^:]*:(\d{8})/) || [])[1], f = (ev.match(/DTEND[^:]*:(\d{8})/) || [])[1];
        if (s && f) addRange(ymd(s), ymd(f));
      });
    } catch (err) { /* un calendario caído no tumba el resto */ }
  });

  var bl = sheet(SHEET_BLOCKS);
  if (bl && bl.getLastRow() > 1) bl.getRange(2, 1, bl.getLastRow() - 1, 2).getValues().forEach(function (r) {
    if (!r[0]) return;
    var a = isoDate(r[0]), b = r[1] ? isoDate(r[1]) : a;
    addRange(a, addDays(b, 1));
  });

  var bk = sheet(SHEET_BOOKINGS);
  if (bk && bk.getLastRow() > 1) bk.getRange(2, 1, bk.getLastRow() - 1, HEADERS.length).getValues().forEach(function (r) {
    if (r[2] === 'Pagada') addRange(isoDate(r[6]), isoDate(r[7]));
  });

  var out = Object.keys(set).sort();
  cache.put(kB, JSON.stringify(out), 600);
  return out;
}
function ymd(s) { return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); }
function isoDate(v) { return v instanceof Date ? Utilities.formatDate(v, CTX.ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : String(v).slice(0, 10); }
function addDays(d, n) { var x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

/* ---------- reservas ---------- */
function newRef(cfg) {
  var p = (cfg.property.name || 'RES').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'RES';
  return p + '-' + Utilities.formatDate(new Date(), 'UTC', 'yyMMdd') + '-' + Math.floor(1000 + Math.random() * 8999);
}
function validate(b) {
  if (!b.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email || '') || !b.phone) throw new Error('datos');
}

function createBooking(b) {
  validate(b);
  var cfg = config();
  CacheService.getScriptCache().remove('blocked_' + CTX.slug);
  b.blocked = blockedDates();
  var q = BookingPricing.quote(cfg, b, b.lang);           // el precio se recalcula aquí: el navegador no lo decide
  if (!q.ok) return { error: q.error };
  if (cfg.payment.mode !== 'stripe') return { error: 'payment mode' };

  var ref = newRef(cfg), cur = (cfg.currency || 'USD').toLowerCase();
  var params = {
    'mode': 'payment',
    'customer_email': b.email,
    'success_url': b.returnUrl + '?session_id={CHECKOUT_SESSION_ID}&lang=' + (b.lang || ''),
    'cancel_url': b.returnUrl + '?lang=' + (b.lang || ''),
    'metadata[ref]': ref,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': cur,
    'line_items[0][price_data][unit_amount]': String(Math.round(q.dueNow * 100)),
    'line_items[0][price_data][product_data][name]': cfg.property.name + ' · ' + b.checkIn + ' → ' + b.checkOut,
    'line_items[0][price_data][product_data][description]': q.nights + ' noches · ' + b.guests + ' huéspedes · ' + ref
  };
  var res = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'post', headers: cabecerasStripe_(cfg), payload: params, muteHttpExceptions: true
  });
  var s = JSON.parse(res.getContentText());
  if (!s.url) return { error: (s.error && s.error.message) || 'stripe' };

  appendRow(b, q, ref, 'Pendiente de pago', s.id, cfg);
  return { url: s.url, ref: ref };
}

function createLead(b) {
  validate(b);
  var cfg = config(), q = BookingPricing.quote(cfg, b, b.lang), ref = newRef(cfg);
  appendRow(b, q, ref, 'Solicitud por WhatsApp', '', cfg);
  notifyOwner(cfg, 'Nueva solicitud · ' + cfg.property.name, rowText(b, q, ref, cfg));
  return { ok: true, ref: ref };
}

function appendRow(b, q, ref, status, sid, cfg) {
  sheet(SHEET_BOOKINGS).appendRow([new Date(), ref, status, b.name, b.email, b.phone, b.checkIn, b.checkOut, q.nights || '', b.guests, b.pets || 0,
    (q.extras || []).map(function (x) { return x.name; }).join(', '), q.total || '', q.dueNow || '', cfg.currency, b.lang || '', b.notes || '', sid, '', b.returnUrl || '']);
}

function findRow(col, value) {
  var sh = sheet(SHEET_BOOKINGS), n = sh.getLastRow();
  if (n < 2) return null;
  var vals = sh.getRange(2, 1, n - 1, HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) if (vals[i][col] === value) return { row: i + 2, v: vals[i] };
  return null;
}

function confirmSession(sid) {
  if (!sid) return { paid: false };
  // La sesión vive en la cuenta del propietario, así que hay que preguntarle
  // a esa cuenta: sin la cabecera, Stripe contesta que no existe.
  var res = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sid), {
    headers: cabecerasStripe_(config()), muteHttpExceptions: true
  });
  var s = JSON.parse(res.getContentText());
  if (s.payment_status !== 'paid') return { paid: false };
  var f = findRow(17, sid);
  if (!f) return { paid: true, ref: (s.metadata && s.metadata.ref) || '', email: s.customer_email };
  if (f.v[2] !== 'Pagada') {
    sheet(SHEET_BOOKINGS).getRange(f.row, 3).setValue('Pagada');
    CacheService.getScriptCache().remove('blocked_' + CTX.slug);
    sendConfirmations(f.v);
  }
  return { paid: true, ref: f.v[1], email: f.v[4] };
}

/* ---------- correos ---------- */
function money(cfg, n) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ' + cfg.currency; }
function rowText(b, q, ref, cfg) {
  return ['Referencia: ' + ref, 'Huésped: ' + b.name + ' · ' + b.email + ' · ' + b.phone, 'Entrada: ' + b.checkIn + ' · Salida: ' + b.checkOut,
    'Noches: ' + q.nights + ' · Huéspedes: ' + b.guests + ' · Mascotas: ' + (b.pets || 0),
    'Extras: ' + ((q.extras || []).map(function (x) { return x.name; }).join(', ') || '—'),
    'Total: ' + money(cfg, q.total) + ' · Cobrado: ' + money(cfg, q.dueNow), 'Notas: ' + (b.notes || '—')].join('\n');
}
function notifyOwner(cfg, subject, body) { if (prop('OWNER_EMAIL')) MailApp.sendEmail(prop('OWNER_EMAIL'), subject, body); }

function sendConfirmations(v) {
  var cfg = config(), es = v[15] !== 'en';
  var subject = es ? 'Reserva confirmada · ' + cfg.property.name : 'Reservation confirmed · ' + cfg.property.name;
  var lines = es
    ? ['Hola ' + v[3] + ',', '', 'Tu reserva en ' + cfg.property.name + ' está confirmada.', '', 'Referencia: ' + v[1], 'Entrada: ' + isoDate(v[6]) + ' desde las ' + cfg.property.checkIn, 'Salida: ' + isoDate(v[7]) + ' antes de las ' + cfg.property.checkOut, 'Huéspedes: ' + v[9], 'Pagado: ' + money(cfg, v[13]) + ' de ' + money(cfg, v[12]), '', 'Cualquier duda: ' + cfg.contact.email + ' · WhatsApp ' + cfg.contact.whatsapp, '', cfg.property.name]
    : ['Hi ' + v[3] + ',', '', 'Your reservation at ' + cfg.property.name + ' is confirmed.', '', 'Reference: ' + v[1], 'Check-in: ' + isoDate(v[6]) + ' from ' + cfg.property.checkIn, 'Check-out: ' + isoDate(v[7]) + ' by ' + cfg.property.checkOut, 'Guests: ' + v[9], 'Paid: ' + money(cfg, v[13]) + ' of ' + money(cfg, v[12]), '', 'Questions: ' + cfg.contact.email + ' · WhatsApp ' + cfg.contact.whatsapp, '', cfg.property.name];
  MailApp.sendEmail({ to: v[4], subject: subject, body: lines.join('\n'), replyTo: cfg.contact.email, name: cfg.property.name });
  notifyOwner(cfg, 'Nueva reserva pagada · ' + cfg.property.name + ' · ' + v[1],
    ['Huésped: ' + v[3] + ' · ' + v[4] + ' · ' + v[5], 'Entrada: ' + isoDate(v[6]) + ' · Salida: ' + isoDate(v[7]), 'Huéspedes: ' + v[9] + ' · Mascotas: ' + v[10], 'Extras: ' + (v[11] || '—'), 'Total: ' + money(cfg, v[12]) + ' · Cobrado: ' + money(cfg, v[13]), 'Notas: ' + (v[16] || '—')].join('\n'));
}

/* ---------- reservas abandonadas (activador cada hora) ---------- */
/* El disparador horario es uno solo para toda la plataforma: recorre el
   registro y revisa cliente por cliente. Si uno falla —una hoja borrada, un
   config.json caído— se anota y se sigue con el siguiente, porque si no, el
   primero roto dejaría sin recordatorio a todos los demás. */
function recoverAbandoned() {
  var reg = SpreadsheetApp.openById(prop('REGISTRO_ID')).getSheets()[0];
  var datos = reg.getDataRange().getValues();
  var cab = datos[0].map(function (c) { return String(c).trim().toLowerCase(); });
  var cSlug = cab.indexOf('slug');
  if (cSlug === -1) return;
  var vistos = {};
  for (var k = 1; k < datos.length; k++) {
    var sl = String(datos[k][cSlug]).trim();
    if (!sl || vistos[sl] || !SLUG_OK.test(sl)) continue;
    vistos[sl] = 1;
    try { abre_(sl); recuperaCliente_(); }
    catch (err) { console.warn('recuperación de ' + sl + ': ' + err.message); }
  }
}

function recuperaCliente_() {
  var sh = sheet(SHEET_BOOKINGS), n = sh.getLastRow();
  if (n < 2) return;
  var cfg = config(), now = Date.now(), vals = sh.getRange(2, 1, n - 1, HEADERS.length).getValues(), blocked = null;
  vals.forEach(function (v, i) {
    if (v[2] !== 'Pendiente de pago' || v[18]) return;
    var age = (now - new Date(v[0]).getTime()) / 36e5;
    if (age < 1 || age > 48) return;
    if (v[17] && confirmSession(v[17]).paid) return;               // pagó y no regresó a la página
    blocked = blocked || blockedDates();
    var free = BookingPricing.dayList(isoDate(v[6]), isoDate(v[7])).every(function (d) { return blocked.indexOf(d) === -1; });
    if (!free) return;
    var es = v[15] !== 'en', link = (v[19] || '') + '?lang=' + (v[15] || '');
    MailApp.sendEmail({ to: v[4], name: cfg.property.name, replyTo: cfg.contact.email,
      subject: es ? 'Tus fechas en ' + cfg.property.name + ' siguen disponibles' : 'Your dates at ' + cfg.property.name + ' are still available',
      body: (es ? ['Hola ' + v[3] + ',', '', 'Vimos que empezaste una reserva del ' + isoDate(v[6]) + ' al ' + isoDate(v[7]) + ' y no se completó.', 'Las fechas siguen libres por ahora. Puedes terminarla aquí:', link, '', 'Si tuviste algún problema con el pago, respóndenos y te ayudamos.', '', cfg.property.name]
        : ['Hi ' + v[3] + ',', '', 'You started a reservation from ' + isoDate(v[6]) + ' to ' + isoDate(v[7]) + ' that was not completed.', 'The dates are still free for now. You can finish it here:', link, '', 'If something went wrong with the payment, just reply and we will help.', '', cfg.property.name]).join('\n') });
    sh.getRange(i + 2, 19).setValue(new Date());
  });
}

/* ---------- instalación (correr una vez) ---------- */
/* Las hojas de cada cliente las crea el alta (backend/Intake.gs), así que
   aquí ya no hay nada que montar por propiedad. Esto queda como prueba de
   que la plataforma está bien configurada: registro accesible, cliente
   resoluble, hoja abierta y config legible. */
function comprueba(slug) {
  if (!slug) return 'Pásale un slug: comprueba("casa-larios")';
  var c = abre_(slug);
  var r = sheet(SHEET_BOOKINGS), b = sheet(SHEET_BLOCKS);
  return [
    'Cliente: ' + c.cfg.property.name,
    'Hoja: ' + c.ss.getName(),
    'Reservas: ' + (r ? r.getLastRow() - 1 + ' filas' : 'FALTA la pestaña'),
    'Bloqueos: ' + (b ? b.getLastRow() - 1 + ' filas' : 'FALTA la pestaña'),
    'Fechas bloqueadas: ' + blockedDates().length,
    'Cobro: ' + c.cfg.payment.mode + (c.cfg.payment.stripeAccount ? ' · ' + c.cfg.payment.stripeAccount : ' · sin cuenta conectada')
  ].join('\n');
}

/* El disparador horario, una sola vez para toda la plataforma. */
function instalaDisparador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'recoverAbandoned') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('recoverAbandoned').timeBased().everyHours(1).create();
  return 'Disparador puesto';
}

/* ================= pricing.js (copiado automáticamente; no editar aquí) ================= */
/*
 * Motor de precios · igual en el navegador y en el backend (backend/Code.gs lo copia tal cual).
 * No se edita por cliente: los precios viven en config.json.
 *
 * quote(cfg, {checkIn, checkOut, guests, pets, extras:[ids]}) ->
 *   {ok, error?, nights, segments:[{name, nightly, nights, amount}], cleaning, pets, extras:[{id,name,amount}],
 *    subtotal, tax, total, dueNow, minNights}
 */
var BookingPricing = (function () {
  function dayList(ci, co) {
    var out = [], d = new Date(ci + 'T12:00:00Z'), e = new Date(co + 'T12:00:00Z');
    while (d < e) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
    return out;
  }
  function seasonFor(cfg, day) {
    var ss = (cfg.rates && cfg.rates.seasons) || [];
    for (var i = 0; i < ss.length; i++) if (day >= ss[i].from && day <= ss[i].to) return ss[i];
    return { name: { es: 'Tarifa estándar', en: 'Standard rate' }, nightly: cfg.rates.defaultNightly, minNights: cfg.rates.defaultMinNights, _default: true };
  }
  function nm(v, lang) { return (v && typeof v === 'object') ? (v[lang] || v.en || v.es || '') : (v || ''); }
  function round2(n) { return Math.round(n * 100) / 100; }

  function quote(cfg, b, lang) {
    lang = lang || cfg.defaultLanguage || 'es';
    var r = { ok: false };
    if (!b || !b.checkIn || !b.checkOut || b.checkOut <= b.checkIn) { r.error = 'dates'; return r; }
    var days = dayList(b.checkIn, b.checkOut);
    var blocked = (b.blocked || []);
    for (var i = 0; i < days.length; i++) if (blocked.indexOf(days[i]) > -1) { r.error = 'unavailable'; return r; }
    var guests = +b.guests || 1, pets = +b.pets || 0;
    if (guests < 1 || guests > (cfg.property.maxGuests || 99)) { r.error = 'guests'; return r; }
    if (pets < 0 || pets > (cfg.fees.maxPets || 0)) { r.error = 'pets'; return r; }

    var first = seasonFor(cfg, b.checkIn);
    r.minNights = first.minNights || cfg.rates.defaultMinNights || 1;
    r.nights = days.length;
    if (r.nights < r.minNights) { r.error = 'minNights'; return r; }

    var segs = [];
    days.forEach(function (d) {
      var s = seasonFor(cfg, d), key = nm(s.name, lang) + '|' + s.nightly, last = segs[segs.length - 1];
      if (last && last.key === key) { last.nights++; last.amount += s.nightly; }
      else segs.push({ key: key, name: nm(s.name, lang), nightly: s.nightly, nights: 1, amount: s.nightly });
    });
    r.segments = segs.map(function (s) { return { name: s.name, nightly: s.nightly, nights: s.nights, amount: s.amount }; });
    var lodging = segs.reduce(function (a, s) { return a + s.amount; }, 0);
    r.cleaning = +cfg.fees.cleaning || 0;
    r.pets = pets * (+cfg.fees.petPerNight || 0) * r.nights;

    var wanted = b.extras || [];
    r.extras = (cfg.extras || []).filter(function (x) { return wanted.indexOf(x.id) > -1; }).map(function (x) {
      var amt = x.unit === 'night' ? x.price * r.nights : x.unit === 'guest' ? x.price * guests : x.price;
      return { id: x.id, name: nm(x.name, lang), amount: amt, unit: x.unit, price: x.price };
    });
    var extrasT = r.extras.reduce(function (a, x) { return a + x.amount; }, 0);
    r.subtotal = round2(lodging + r.cleaning + r.pets + extrasT);
    r.tax = round2(r.subtotal * ((+cfg.fees.taxPercent || 0) / 100));
    r.total = round2(r.subtotal + r.tax);
    var pct = Math.min(100, Math.max(1, +((cfg.payment && cfg.payment.chargePercent) || 100)));
    r.dueNow = round2(r.total * pct / 100);
    r.ok = true;
    return r;
  }
  return { quote: quote, seasonFor: seasonFor, dayList: dayList, name: nm };
})();


