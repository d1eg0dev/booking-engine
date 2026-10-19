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
if (typeof module !== 'undefined') module.exports = BookingPricing;
