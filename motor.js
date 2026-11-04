/* Motor de reservas de marca blanca. Todo lo de cada propiedad viene de config.json. */
var T = {
  es: { reserve:'Reservar', dates:'Fechas', extras:'Extras', details:'Datos', month:['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
    dow:['Do','Lu','Ma','Mi','Ju','Vi','Sá'], selected:'Seleccionado', stay:'Tu estancia', unavailable:'No disponible', perNight:'/ noche', min:'mín.', nights:'noches', night:'noche',
    guests:'Huéspedes', pets:'Mascotas', none:'Ninguna', cont:'Continuar', back:'Atrás', addTitle:'Agrega a tu estancia', addSub:'Opcional. Se cobra junto con la reserva.',
    perStay:'por estancia', perGuest:'por huésped', detTitle:'Tus datos', detSub:'Solo los usamos para confirmar tu reserva.', name:'Nombre completo', email:'Correo', phone:'Teléfono / WhatsApp',
    notes:'Peticiones especiales', notesPh:'Hora de llegada, celebraciones, alimentación…', accept:'He leído y acepto el <a href="#" onclick="openMod(event)">contrato de renta y la política de cancelación</a>.',
    complete:'Para continuar, completa:', validEmail:'Un correo válido', acceptAg:'Aceptar el contrato', checkin:'Entrada', checkout:'Salida', cleaning:'Limpieza', petFee:'Mascotas', tax:'Impuestos',
    total:'Total', dueNow:'A pagar hoy', rest:'Resto, antes de la llegada', pay:'Pagar', request:'Enviar solicitud por WhatsApp', secure:'El pago se procesa de forma segura con Stripe',
    minStay:'Estancia mínima', minStayTxt:'Estas fechas requieren al menos {n} noches.', unavail:'Alguna de esas noches ya no está disponible. Elige otras fechas.',
    demo:'Modo demostración: no se hace ningún cargo.', confirmed:'Reserva confirmada', confirmedTxt:'Te enviamos la confirmación a {e}. Nos pondremos en contacto en menos de 24 horas.',
    demoDone:'Demostración: no se procesó ningún pago.', again:'Empezar de nuevo', processing:'Procesando…', error:'No pudimos procesar la reserva. Intenta de nuevo o escríbenos por WhatsApp.',
    checking:'Confirmando tu pago…', notPaid:'No encontramos el pago de esta reserva. Si ya pagaste, escríbenos y lo revisamos.', direct:'Reserva directa' },
  en: { reserve:'Reserve', dates:'Dates', extras:'Extras', details:'Details', month:['January','February','March','April','May','June','July','August','September','October','November','December'],
    dow:['Su','Mo','Tu','We','Th','Fr','Sa'], selected:'Selected', stay:'Your stay', unavailable:'Unavailable', perNight:'/ night', min:'min', nights:'nights', night:'night',
    guests:'Guests', pets:'Pets', none:'None', cont:'Continue', back:'Back', addTitle:'Add to your stay', addSub:'Optional. Charged with your reservation.',
    perStay:'per stay', perGuest:'per guest', detTitle:'Your details', detSub:'We only use these to confirm your reservation.', name:'Full name', email:'Email', phone:'Phone / WhatsApp',
    notes:'Special requests', notesPh:'Arrival time, celebrations, dietary needs…', accept:'I have read and accept the <a href="#" onclick="openMod(event)">rental agreement and cancellation policy</a>.',
    complete:'To continue, please complete:', validEmail:'A valid email address', acceptAg:'Accept the agreement', checkin:'Check-in', checkout:'Check-out', cleaning:'Cleaning fee', petFee:'Pet fee', tax:'Taxes',
    total:'Total', dueNow:'Due today', rest:'Balance, before arrival', pay:'Pay', request:'Send request on WhatsApp', secure:'Payment is processed securely by Stripe',
    minStay:'Minimum stay', minStayTxt:'These dates require at least {n} nights.', unavail:'Some of those nights are no longer available. Please pick other dates.',
    demo:'Demo mode: nothing is charged.', confirmed:'Reservation confirmed', confirmedTxt:'A confirmation has been sent to {e}. We will be in touch within 24 hours.',
    demoDone:'Demo only: no payment was processed.', again:'Start again', processing:'Processing…', error:'We could not process the reservation. Please try again or message us on WhatsApp.',
    checking:'Confirming your payment…', notPaid:'We could not find the payment for this reservation. If you already paid, message us and we will check.', direct:'Direct booking' }
};
/* Rentas por día (autos, yates, espacios): mismos cálculos, otras palabras. Se activa con "unit": "day" en config.json. */
var TD = {
  es: { stay:'Tu reserva', perNight:'/ día', nights:'días', night:'día', guests:'Personas', addTitle:'Agrega a tu reserva', perStay:'por reserva', perGuest:'por persona',
    notesPh:'Hora de llegada, lugar de entrega, detalles…', checkin:'Inicio', checkout:'Fin', rest:'Resto, antes de la fecha', minStay:'Reserva mínima',
    minStayTxt:'Estas fechas requieren al menos {n} días.', unavail:'Alguno de esos días ya no está disponible. Elige otras fechas.' },
  en: { stay:'Your booking', perNight:'/ day', nights:'days', night:'day', guests:'People', addTitle:'Add to your booking', perStay:'per booking', perGuest:'per person',
    notesPh:'Arrival time, pick-up place, details…', checkin:'Start', checkout:'End', rest:'Balance, before the date', minStay:'Minimum booking',
    minStayTxt:'These dates require at least {n} days.', unavail:'Some of those days are no longer available. Please pick other dates.' }
};
var C = null, L = 'es', BLOCKED = [];
var S = { step:0, m:0, y:0, ci:null, co:null, g:2, pets:0, ad:{}, nm:'', em:'', ph:'', nt:'', ag:false, touched:false, busy:false, done:null, err:'' };

function t(k){ var d = C && C.unit === 'day' && TD[L] && TD[L][k]; return d || (T[L] && T[L][k]) || T.en[k] || k; }
function nm(v){ return BookingPricing.name(v, L); }
/* Se admite http(s) y la ruta relativa de las fotos que viven en el propio
   repo del cliente ("fotos/1.jpg"), que es el caso normal. Nada más: el
   config lo llena un cliente por formulario y una dirección rara no debe
   acabar en un atributo de la página. */
function foto(u){
  var s = String(u || '').trim();
  if(/^https?:\/\/\S+$/i.test(s)) return s;
  if(/^fotos\/[\w.-]+\.(jpe?g|png|webp)$/i.test(s)) return s;
  return '';
}
function fotos(){ return (C.property.photos || []).map(foto).filter(Boolean); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
/* Con el código de moneda al lado. "$4,200" no le dice nada a un huésped
   que no sabe si cobras en pesos o en dólares, y el símbolo es el mismo en
   los dos. Va donde se decide el gasto —totales y botón de pago— y no en
   cada celda del calendario, donde no cabe y sería ruido. */
function moneyCur(n){ return money(n) + ' ' + (C.currency || 'USD'); }

function money(n){
  // narrowSymbol para que MXN salga "$333" y no "MX$333" cuando el locale no
  // es mexicano. Si el navegador es viejo y no lo admite, tira RangeError y se
  // cae al formato normal, que sigue llevando símbolo.
  var o = { style:'currency', currency:C.currency || 'USD', maximumFractionDigits: n % 1 ? 2 : 0 };
  try { return Number(n).toLocaleString(C.locale || 'es-MX', Object.assign({ currencyDisplay:'narrowSymbol' }, o)); }
  catch(e){ return Number(n).toLocaleString(C.locale || 'es-MX', o); }
}
function iso(y,m,d){ return y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0'); }
function today(){ return new Date().toISOString().slice(0,10); }
function fdt(k){ return new Date(k + 'T12:00:00').toLocaleDateString(L === 'es' ? 'es-MX' : 'en-US', { weekday:'short', day:'numeric', month:'short', year:'numeric' }); }
function q(){ return BookingPricing.quote(C, { checkIn:S.ci, checkOut:S.co, guests:S.g, pets:S.pets, extras:Object.keys(S.ad).filter(function(k){ return S.ad[k]; }), blocked:BLOCKED }, L); }
function emOk(){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(S.em.trim()); }
function missing(){ var m = []; if(!S.nm.trim()) m.push(t('name')); if(!S.em.trim()) m.push(t('email')); else if(!emOk()) m.push(t('validEmail')); if(!S.ph.trim()) m.push(t('phone')); if(!S.ag) m.push(t('acceptAg')); return m; }
function backend(params){ return C.backendUrl + (C.backendUrl.indexOf('?') > -1 ? '&' : '?') + params; }

function applyBrand(){
  var b = C.brand || {}, r = document.documentElement.style;
  if(b.ink) r.setProperty('--ink', b.ink);
  if(b.accent){ r.setProperty('--acc', b.accent); r.setProperty('--acc-tint', b.accent + '1A'); }
  if(b.paper) r.setProperty('--paper', b.paper);
  if(b.font && b.font !== 'Inter'){
    document.getElementById('fontLink').href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(b.font) + ':wght@300;400;500;600&display=swap';
    r.setProperty('--f', "'" + b.font + "',-apple-system,'Helvetica Neue',Arial,sans-serif");
  }
  document.title = t('reserve') + ' · ' + C.property.name;
}

function pick(k){
  if(BLOCKED.indexOf(k) > -1 || k < today()) return;
  if(!S.ci || S.co || k <= S.ci){ S.ci = k; S.co = null; }
  else {
    var hit = BookingPricing.dayList(S.ci, k).some(function(d){ return BLOCKED.indexOf(d) > -1; });
    if(hit){ S.ci = k; S.co = null; } else S.co = k;
  }
  R();
}
function shift(n){ S.m += n; if(S.m > 11){ S.m = 0; S.y++; } if(S.m < 0){ S.m = 11; S.y--; } R(); }
function setLang(l){ L = l; document.documentElement.lang = l; applyBrand(); R(); }
function setF(k, v){ S[k] = v; S.touched = true; sync(); }
function sync(){
  var b = document.getElementById('payBtn'), mv = document.getElementById('missBox'), ab = document.getElementById('agrBox'), m = missing();
  if(b) b.disabled = m.length > 0 || S.busy;
  if(ab) ab.classList.toggle('need', S.touched && !S.ag);
  if(mv){ mv.style.display = (S.touched && m.length) ? 'block' : 'none'; mv.innerHTML = '<b>' + t('complete') + '</b>' + m.map(esc).join(' · '); }
}
function openMod(e){ if(e) e.preventDefault(); document.getElementById('policy').innerHTML = (C.policy && (C.policy[L] || C.policy.en)) || ''; document.getElementById('mod').classList.add('show'); }
function closeMod(){ document.getElementById('mod').classList.remove('show'); }
function go(step){ S.step = step; R(); window.scrollTo(0, 0); }

function summary(){
  var r = q(); if(!r.ok) return '';
  var h = '<div class="sm"><div class="smh">' + t('stay') + '</div>'
    + '<div class="r"><span>' + t('checkin') + '<small>' + fdt(S.ci) + '</small></span><span style="text-align:right">' + t('checkout') + '<small>' + fdt(S.co) + '</small></span></div>';
  r.segments.forEach(function(s){ h += '<div class="r"><span>' + esc(s.name) + '<small>' + s.nights + ' ' + (s.nights > 1 ? t('nights') : t('night')) + ' × ' + money(s.nightly) + '</small></span><b>' + money(s.amount) + '</b></div>'; });
  if(r.cleaning) h += '<div class="r"><span>' + t('cleaning') + '</span><b>' + money(r.cleaning) + '</b></div>';
  if(r.pets) h += '<div class="r"><span>' + t('petFee') + '</span><b>' + money(r.pets) + '</b></div>';
  r.extras.forEach(function(x){ h += '<div class="r"><span>' + esc(x.name) + '</span><b>' + money(x.amount) + '</b></div>'; });
  if(r.tax) h += '<div class="r"><span>' + t('tax') + '</span><b>' + money(r.tax) + '</b></div>';
  h += '<div class="r tt"><span>' + t('total') + '</span><b>' + moneyCur(r.total) + '</b></div>';
  if(r.dueNow < r.total) h += '<div class="r"><span>' + t('dueNow') + '</span><b>' + moneyCur(r.dueNow) + '</b></div><div class="r" style="border:none"><span>' + t('rest') + '</span><b>' + moneyCur(r.total - r.dueNow) + '</b></div>';
  return h + '</div>';
}

function payload(){
  return { checkIn:S.ci, checkOut:S.co, guests:S.g, pets:S.pets, extras:Object.keys(S.ad).filter(function(k){ return S.ad[k]; }),
    name:S.nm.trim(), email:S.em.trim(), phone:S.ph.trim(), notes:S.nt.trim(), lang:L, returnUrl:location.href.split('?')[0] };
}
function submit(){
  if(missing().length) return;
  var mode = (C.payment && C.payment.mode) || 'demo', r = q();
  if(!r.ok){ S.err = t('unavail'); R(); return; }
  if(mode === 'demo'){ S.done = { ref:'DEMO-' + Math.floor(1000 + Math.random() * 8999), demo:true }; R(); return; }
  if(mode === 'whatsapp'){
    var lines = [C.property.name + ' · ' + t('reserve'), t('checkin') + ': ' + S.ci, t('checkout') + ': ' + S.co, t('guests') + ': ' + S.g];
    r.extras.forEach(function(x){ lines.push('+ ' + x.name); });
    lines.push(t('total') + ': ' + moneyCur(r.total), S.nm + ' · ' + S.em + ' · ' + S.ph); if(S.nt) lines.push(S.nt);
    if(C.backendUrl) fetch(backend('action=lead'), { method:'POST', body:JSON.stringify(payload()) }).catch(function(){});
    window.open('https://wa.me/' + C.contact.whatsapp.replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent(lines.join('\n')), '_blank');
    return;
  }
  S.busy = true; S.err = ''; R();
  fetch(backend('action=book'), { method:'POST', body:JSON.stringify(payload()) })
    .then(function(res){ return res.json(); })
    .then(function(d){ if(d && d.url){ window.top.location.href = d.url; } else { throw new Error(d && d.error); } })
    .catch(function(){ S.busy = false; S.err = t('error'); R(); });
}

function R(){
  var a = document.getElementById('app'), langs = C.languages || ['es'];
  var top = '<div class="top">' + (C.property.logo ? '<img src="' + esc(C.property.logo) + '" alt="' + esc(C.property.name) + '">' : '<span></span>')
    + (langs.length > 1 ? '<div class="lang">' + langs.map(function(l){ return '<button class="' + (l === L ? 'on' : '') + '" onclick="setLang(\'' + l + '\')">' + l.toUpperCase() + '</button>'; }).join('') + '</div>' : '') + '</div>';
  var foot = C.brand && C.brand.poweredBy ? '<p class="ft">' + t('direct') + ' · <a href="https://wdstudio.agency" target="_blank" rel="noopener">WD Studio</a></p>' : '';

  if(S.done){
    a.innerHTML = top + '<div class="ok"><div class="ic">✓</div><h2>' + t('confirmed') + '</h2><p>' + esc(t('confirmedTxt').replace('{e}', S.done.email || S.em)) + '</p>'
      + '<div class="rf">' + esc(S.done.ref) + '</div>' + (S.done.demo ? '<p style="margin-top:24px;font-size:12.5px">' + t('demoDone') + '<br><a href="#" onclick="location.reload();return false" style="color:var(--acc)">' + t('again') + '</a></p>' : '') + '</div>' + foot;
    return;
  }
  if(S.checking){ a.innerHTML = top + '<div class="load">' + (S.checking === 'fail' ? esc(t('notPaid')) : t('checking')) + '</div>'; return; }

  var hasExtras = (C.extras || []).length > 0, labels = hasExtras ? [t('dates'), t('extras'), t('details')] : [t('dates'), t('details')];
  var cur = (!hasExtras && S.step === 2) ? 1 : S.step, st = '';
  labels.forEach(function(lb, i){ st += '<div class="stp' + (cur < i ? ' dim' : '') + (cur === i ? ' cur' : '') + '"><div class="dot' + (cur === i ? ' on' : cur > i ? ' hecho' : '') + '">' + (cur > i ? '✓' : i + 1) + '</div><span>' + lb + '</span></div>'; });
  // La portada manda: el nombre de la propiedad es el título de la página y
  // "Reservar" pasa a ser el encabezado de la sección del formulario. Si una
  // imagen no carga se borra sola, porque un enlace de Drive pegado por el
  // cliente no se puede incrustar y un icono roto se ve peor que nada.
  var ph = fotos(), about = (C.property.about ? nm(C.property.about) : '').trim();
  var h = top + ((C.payment && C.payment.mode === 'demo') ? '<div class="bar">' + t('demo') + '</div>' : '')
    + (ph.length ? '<img class="hero" src="' + esc(ph[0]) + '" alt="' + esc(C.property.name)
        + '" onerror="this.remove()">' : '')
    + '<h1>' + esc(C.property.name) + '</h1>'
    + (C.property.tagline ? '<p class="sub">' + esc(nm(C.property.tagline)) + '</p>' : '')
    + (about ? '<p class="about">' + esc(about) + '</p>' : '')
    + (ph.length > 1 ? '<div class="gal">' + ph.slice(1, 7).map(function(u){
        return '<img src="' + esc(u) + '" alt="' + esc(C.property.name) + '" loading="lazy" onerror="this.remove()">';
      }).join('') + '</div>' : '')
    + '<h2 class="sec">' + t('reserve') + '</h2>'
    + '<div class="steps">' + st + '</div>';
  var r = (S.ci && S.co) ? q() : null;

  if(S.step === 0){
    var first = new Date(S.y, S.m, 1).getDay(), days = new Date(S.y, S.m + 1, 0).getDate(), td = today();
    h += '<div class="calhd"><h3>' + t('month')[S.m] + ' ' + S.y + '</h3><div class="nav"><button onclick="shift(-1)" aria-label="prev">‹</button><button onclick="shift(1)" aria-label="next">›</button></div></div>'
      + '<div class="cal"><div class="dow">' + t('dow').map(function(d){ return '<div>' + d + '</div>'; }).join('') + '</div><div class="gr">';
    for(var i = 0; i < first; i++) h += '<div class="dy pad"></div>';
    for(var d = 1; d <= days; d++){
      var k = iso(S.y, S.m, d), c = 'dy', bk = BLOCKED.indexOf(k) > -1, past = k < td, s = BookingPricing.seasonFor(C, k);
      if(past) c += ' off'; else if(bk) c += ' bk'; else if(k === S.ci || k === S.co) c += ' sel'; else if(S.ci && S.co && k > S.ci && k < S.co) c += ' rng';
      h += '<button class="' + c + '" onclick="pick(\'' + k + '\')"' + (past || bk ? ' disabled' : '') + '>' + d + (bk || past ? '' : '<i>' + money(Math.round(s.nightly)) + '</i>') + '</button>';
    }
    h += '</div><div class="lg"><span><s style="background:var(--ink)"></s>' + t('selected') + '</span><span><s style="background:var(--acc-tint)"></s>' + t('stay') + '</span><span><s style="background:#FBF4F3"></s>' + t('unavailable') + '</span>'
      // En el paso 1 no hay total todavía, así que la moneda se dice aquí,
      // que es donde el huésped ve los primeros precios.
      + '<span style="margin-left:auto">' + (C.currency || 'USD') + '</span></div></div>';
    var ss = (C.rates.seasons || []).filter(function(x){ return x.to >= td; });
    if(ss.length){ h += '<div class="tbl">'; ss.forEach(function(x){ h += '<div class="r"><span><b>' + esc(nm(x.name)) + '</b> <em>· ' + t('min') + ' ' + x.minNights + ' ' + t('nights') + '</em></span><b>' + moneyCur(x.nightly) + ' ' + t('perNight') + '</b></div>'; }); h += '</div>'; }
    var gOpts = ''; for(var g = 1; g <= (C.property.maxGuests || 10); g++) gOpts += '<option value="' + g + '"' + (S.g === g ? ' selected' : '') + '>' + g + '</option>';
    h += '<div class="r2" style="margin-top:20px"><div class="fl"><label class="lb">' + t('guests') + '</label><select onchange="S.g=+this.value;R()">' + gOpts + '</select></div>';
    if(C.fees.maxPets){ var pOpts = ''; for(var p = 0; p <= C.fees.maxPets; p++) pOpts += '<option value="' + p + '"' + (S.pets === p ? ' selected' : '') + '>' + (p || t('none')) + '</option>'; h += '<div class="fl"><label class="lb">' + t('pets') + '</label><select onchange="S.pets=+this.value;R()">' + pOpts + '</select></div>'; }
    h += '</div>';
    if(r){ if(r.ok) h += summary(); else if(r.error === 'minNights') h += '<div class="miss"><b>' + t('minStay') + '</b>' + t('minStayTxt').replace('{n}', r.minNights) + '</div>'; else if(r.error === 'unavailable') h += '<div class="miss">' + t('unavail') + '</div>'; }
    h += '<div class="bn"><button class="bp" onclick="go(' + (hasExtras ? 1 : 2) + ')"' + (r && r.ok ? '' : ' disabled') + '>' + t('cont') + '</button></div>';
  }
  if(S.step === 1){
    h += '<h2>' + t('addTitle') + '</h2><p class="h2s">' + t('addSub') + '</p>';
    C.extras.forEach(function(x){
      var on = !!S.ad[x.id], unit = x.unit === 'night' ? t('perNight') : x.unit === 'guest' ? t('perGuest') : t('perStay');
      h += '<button class="ad' + (on ? ' on' : '') + '" onclick="S.ad[\'' + x.id + '\']=!S.ad[\'' + x.id + '\'];R()"><div class="bx">' + (on ? '✓' : '') + '</div><div class="tx"><b>' + esc(nm(x.name)) + '</b><span>' + esc(nm(x.desc)) + '</span></div><div class="pr">' + money(x.price) + ' ' + unit + '</div></button>';
    });
    h += summary() + '<div class="bn"><button class="bs" onclick="go(0)">' + t('back') + '</button><button class="bp" onclick="go(2)">' + t('cont') + '</button></div>';
  }
  if(S.step === 2){
    var mode = (C.payment && C.payment.mode) || 'demo', due = r && r.ok ? r.dueNow : 0;
    h += '<h2>' + t('detTitle') + '</h2><p class="h2s">' + t('detSub') + '</p>'
      + '<div class="r2"><div class="fl"><label class="lb">' + t('name') + ' *</label><input value="' + esc(S.nm) + '" oninput="setF(\'nm\',this.value)" autocomplete="name"></div>'
      + '<div class="fl"><label class="lb">' + t('email') + ' *</label><input type="email" value="' + esc(S.em) + '" oninput="setF(\'em\',this.value)" autocomplete="email"></div></div>'
      + '<div class="fl"><label class="lb">' + t('phone') + ' *</label><input type="tel" value="' + esc(S.ph) + '" oninput="setF(\'ph\',this.value)" autocomplete="tel"></div>'
      + '<div class="fl"><label class="lb">' + t('notes') + '</label><textarea oninput="S.nt=this.value" placeholder="' + esc(t('notesPh')) + '">' + esc(S.nt) + '</textarea></div>'
      + summary()
      + '<label class="agr" id="agrBox"><input type="checkbox"' + (S.ag ? ' checked' : '') + ' onchange="setF(\'ag\',this.checked)"><span>' + t('accept') + ' *</span></label>'
      + '<div class="miss" id="missBox" style="display:none"></div>'
      + (S.err ? '<div class="miss">' + esc(S.err) + '</div>' : '')
      + '<div class="bn"><button class="bs" onclick="go(' + (hasExtras ? 1 : 0) + ')">' + t('back') + '</button><button class="bp" id="payBtn" onclick="submit()">'
      + (S.busy ? t('processing') : mode === 'whatsapp' ? t('request') : t('pay') + ' · ' + moneyCur(due)) + '</button></div>'
      + (mode === 'stripe' ? '<p style="margin-top:12px;font-size:11.5px;color:var(--mute);text-align:center">' + t('secure') + '</p>' : '');
  }
  a.innerHTML = h + foot;
  if(S.step === 2) sync();
}

function loadAvailability(){
  BLOCKED = (C.availability && C.availability.blockedDates) || [];
  if(!C.backendUrl) return Promise.resolve();
  return fetch(backend('action=availability')).then(function(r){ return r.json(); })
    .then(function(d){ if(d && d.blocked) BLOCKED = BLOCKED.concat(d.blocked); }).catch(function(){});
}
function checkReturn(){
  var p = new URLSearchParams(location.search), sid = p.get('session_id');
  if(!sid || !C.backendUrl) return Promise.resolve();
  S.checking = true; R();
  return fetch(backend('action=confirm&session_id=' + encodeURIComponent(sid))).then(function(r){ return r.json(); })
    .then(function(d){ if(d && d.paid){ S.checking = false; S.done = { ref:d.ref, email:d.email }; } else S.checking = 'fail'; })
    .catch(function(){ S.checking = 'fail'; });
}

fetch('config.json', { cache:'no-store' }).then(function(r){ return r.json(); }).then(function(cfg){
  C = cfg;
  var p = new URLSearchParams(location.search), want = p.get('lang') || C.defaultLanguage || 'es';
  L = (C.languages || ['es']).indexOf(want) > -1 ? want : (C.languages || ['es'])[0];
  document.documentElement.lang = L;
  var now = new Date();
  S.y = now.getFullYear(); S.m = now.getMonth();
  applyBrand();
  return loadAvailability().then(checkReturn).then(R);
}).catch(function(){
  // Sin config no hay nada que pintar. El mensaje va en los dos idiomas
  // porque todavía no sabemos cuál es el del cliente.
  document.getElementById('app').innerHTML = '<div class="load">No pudimos cargar esta página. '
    + 'Vuelve a intentar en un momento.<br>We could not load this page. Please try again shortly.</div>';
});
