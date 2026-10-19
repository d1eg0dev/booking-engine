/**
 * Backend del motor de reservas (Google Apps Script, ligado a una Google Sheet).
 * NO se edita por cliente. Todo sale de config.json (CONFIG_URL) y de las Propiedades del script.
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   CONFIG_URL         URL pública del config.json del cliente (p. ej. https://usuario.github.io/casa-x/config.json)
 *   STRIPE_SECRET_KEY  sk_live_... o sk_test_...   (solo si payment.mode = "stripe")
 *   OWNER_EMAIL        correo(s) del dueño para avisos, separados por coma
 *
 * Hojas que crea setup(): "Reservas" y "Bloqueos" (en Bloqueos: columna A = desde, B = hasta, C = nota).
 */

var SHEET_BOOKINGS = 'Reservas';
var SHEET_BLOCKS = 'Bloqueos';
var HEADERS = ['Creada', 'Referencia', 'Estado', 'Nombre', 'Correo', 'Teléfono', 'Entrada', 'Salida', 'Noches', 'Huéspedes', 'Mascotas', 'Extras', 'Total', 'Cobrado hoy', 'Moneda', 'Idioma', 'Notas', 'Stripe session', 'Recuperación enviada', 'URL de regreso'];

/* ---------- entradas ---------- */
function doGet(e) {
  var a = (e.parameter.action || '');
  try {
    if (a === 'availability') return json({ blocked: blockedDates() });
    if (a === 'confirm') return json(confirmSession(e.parameter.session_id));
    return json({ ok: true });
  } catch (err) { return json({ error: String(err) }); }
}

function doPost(e) {
  var a = (e.parameter.action || '');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (a === 'book') return json(createBooking(body));
    if (a === 'lead') return json(createLead(body));
    return json({ error: 'action' });
  } catch (err) { return json({ error: String(err) }); }
  finally { lock.releaseLock(); }
}

/* ---------- configuración ---------- */
function prop(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function config() {
  var cache = CacheService.getScriptCache(), hit = cache.get('cfg');
  if (hit) return JSON.parse(hit);
  var res = UrlFetchApp.fetch(prop('CONFIG_URL') + '?t=' + Date.now(), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('No se pudo leer CONFIG_URL');
  cache.put('cfg', res.getContentText(), 300);
  return JSON.parse(res.getContentText());
}
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sheet(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

/* ---------- disponibilidad ---------- */
function blockedDates() {
  var cache = CacheService.getScriptCache(), hit = cache.get('blocked');
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
  cache.put('blocked', JSON.stringify(out), 600);
  return out;
}
function ymd(s) { return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); }
function isoDate(v) { return v instanceof Date ? Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd') : String(v).slice(0, 10); }
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
  CacheService.getScriptCache().remove('blocked');
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
    method: 'post', headers: { Authorization: 'Bearer ' + prop('STRIPE_SECRET_KEY') }, payload: params, muteHttpExceptions: true
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
  var res = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sid), {
    headers: { Authorization: 'Bearer ' + prop('STRIPE_SECRET_KEY') }, muteHttpExceptions: true
  });
  var s = JSON.parse(res.getContentText());
  if (s.payment_status !== 'paid') return { paid: false };
  var f = findRow(17, sid);
  if (!f) return { paid: true, ref: (s.metadata && s.metadata.ref) || '', email: s.customer_email };
  if (f.v[2] !== 'Pagada') {
    sheet(SHEET_BOOKINGS).getRange(f.row, 3).setValue('Pagada');
    CacheService.getScriptCache().remove('blocked');
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
function recoverAbandoned() {
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
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var a = ss.getSheetByName(SHEET_BOOKINGS) || ss.insertSheet(SHEET_BOOKINGS);
  a.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold'); a.setFrozenRows(1);
  var b = ss.getSheetByName(SHEET_BLOCKS) || ss.insertSheet(SHEET_BLOCKS);
  b.getRange(1, 1, 1, 3).setValues([['Desde', 'Hasta', 'Nota']]).setFontWeight('bold'); b.setFrozenRows(1);
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'recoverAbandoned') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('recoverAbandoned').timeBased().everyHours(1).create();
  config();                                                         // prueba que CONFIG_URL responde
  return 'Listo';
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


