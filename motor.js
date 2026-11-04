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
    checking:'Confirmando tu pago…', notPaid:'No encontramos el pago de esta reserva. Si ya pagaste, escríbenos y lo revisamos.', direct:'Reserva directa',
    navHouse:'La casa', navPhotos:'Fotos', reserveSub:'Elige tus fechas y confirma en unos minutos.',
    cSecure:'Pago seguro', cSecureTxt:'El cobro lo procesa Stripe. Los datos de tu tarjeta no pasan por esta página.',
    cDirect:'Reserva directa', cDirectTxt:'Sin comisiones de intermediarios. Tratas con quien cuida la casa.',
    cRules:'Condiciones por escrito', cRulesTxt:'Cancelación y reglas de la casa, claras y antes de pagar.',
    cAnswer:'Te contestamos', cAnswerTxt:'Escríbenos por WhatsApp si necesitas algo antes de reservar.',
    pickDates:'Elige tus fechas y aquí aparece el total, sin sorpresas.', from:'Desde',
    contact:'Contacto', policies:'Políticas y condiciones', allRights:'Todos los derechos reservados.' },
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
    checking:'Confirming your payment…', notPaid:'We could not find the payment for this reservation. If you already paid, message us and we will check.', direct:'Direct booking',
    navHouse:'The house', navPhotos:'Photos', reserveSub:'Pick your dates and confirm in a few minutes.',
    cSecure:'Secure payment', cSecureTxt:'Payment is processed by Stripe. Your card details never touch this page.',
    cDirect:'Direct booking', cDirectTxt:'No intermediary fees. You deal with the people who look after the house.',
    cRules:'Terms in writing', cRulesTxt:'Cancellation and house rules, clear and before you pay.',
    cAnswer:'A real reply', cAnswerTxt:'Message us on WhatsApp if you need anything before booking.',
    pickDates:'Pick your dates and the total appears here, with no surprises.', from:'From',
    contact:'Contact', policies:'Policies and terms', allRights:'All rights reserved.' }
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
  var ph = fotos(), about = (C.property.about ? nm(C.property.about) : '').trim();
  var modo = (C.payment && C.payment.mode) || 'demo';
  var wa = (C.contact && C.contact.whatsapp || '').replace(/[^0-9]/g, '');

  var idioma = langs.length > 1 ? '<div class="lang">' + langs.map(function(l){
    return '<button class="' + (l === L ? 'on' : '') + '" onclick="setLang(\'' + l + '\')">' + l.toUpperCase() + '</button>';
  }).join('') + '</div>' : '';

  var cabecera = ((modo === 'demo') ? '<div class="bar">' + t('demo') + '</div>' : '')
    + '<header class="hdr" id="top"><div class="hdr-in">'
    + '<a class="marca" href="#top">'
    + (C.property.logo ? '<img src="' + esc(C.property.logo) + '" alt="" onerror="this.remove()">' : '')
    + '<span>' + esc(C.property.name) + '</span></a>'
    + '<nav class="menu">'
    + (about ? '<a href="#lacasa">' + t('navHouse') + '</a>' : '')
    + (ph.length > 1 ? '<a href="#fotos">' + t('navPhotos') + '</a>' : '')
    + '<a href="#reservar">' + t('reserve') + '</a></nav>'
    + idioma + '</div></header>';

  // El pie repite lo que un huésped busca cuando duda: con quién trata, cómo
  // escribirle y qué firma. Las políticas abren el mismo texto que acepta
  // antes de pagar, para que pueda leerlas sin empezar una reserva.
  var pie = '<footer class="pie"><div class="pie-in">'
    + '<div><h4>' + esc(C.property.name) + '</h4>'
    + (C.property.tagline ? '<p>' + esc(nm(C.property.tagline)) + '</p>' : '') + '</div>'
    + '<div class="gr5"><b>' + t('contact') + '</b>'
    + (C.contact && C.contact.email ? '<a href="mailto:' + esc(C.contact.email) + '">' + esc(C.contact.email) + '</a>' : '')
    + (wa ? '<a href="https://wa.me/' + wa + '" target="_blank" rel="noopener">WhatsApp</a>' : '')
    + (C.property.website ? '<a href="' + esc(C.property.website) + '" target="_blank" rel="noopener">' + esc(C.property.website.replace(/^https?:\/\//, '')) + '</a>' : '')
    + '</div>'
    + '<div class="gr5"><b>' + t('navHouse') + '</b>'
    + '<button class="lk" onclick="openMod(event)">' + t('policies') + '</button>'
    + '<a href="#reservar">' + t('reserve') + '</a></div>'
    + '</div><div class="pie-fin"><div>'
    + '<span>© ' + new Date().getFullYear() + ' ' + esc(C.property.name) + '. ' + t('allRights') + '</span>'
    + (C.brand && C.brand.poweredBy
        ? '<span>' + t('direct') + ' · <a href="https://wdstudio.agency" target="_blank" rel="noopener">WD Studio</a></span>'
        : '<span>' + t('direct') + '</span>')
    + '</div></div></footer>';

  if(S.done){
    a.innerHTML = cabecera + '<section class="sx"><div class="col"><div class="ok"><div class="ic">✓</div><h2>' + t('confirmed') + '</h2><p>'
      + esc(t('confirmedTxt').replace('{e}', S.done.email || S.em)) + '</p>'
      + '<div class="rf">' + esc(S.done.ref) + '</div>'
      + (S.done.demo ? '<p style="margin-top:24px;font-size:12.5px">' + t('demoDone')
          + '<br><a href="#" onclick="location.reload();return false" style="color:var(--acc)">' + t('again') + '</a></p>' : '')
      + '</div></div></section>' + pie;
    return;
  }
  if(S.checking){
    a.innerHTML = cabecera + '<section class="sx"><div class="col"><div class="load">'
      + (S.checking === 'fail' ? esc(t('notPaid')) : t('checking')) + '</div></div></section>' + pie;
    return;
  }

  var hasExtras = (C.extras || []).length > 0, labels = hasExtras ? [t('dates'), t('extras'), t('details')] : [t('dates'), t('details')];
  var cur = (!hasExtras && S.step === 2) ? 1 : S.step, st = '';
  labels.forEach(function(lb, i){ st += '<div class="stp' + (cur < i ? ' dim' : '') + (cur === i ? ' cur' : '') + '"><div class="dot' + (cur === i ? ' on' : cur > i ? ' hecho' : '') + '">' + (cur > i ? '✓' : i + 1) + '</div><span>' + lb + '</span></div>'; });

  // La portada manda. Si la foto no carga, la sección se queda en papel con el
  // texto en tinta en vez de reservar media pantalla a una imagen que no está.
  var portada = '<section class="port' + (ph.length ? '' : ' sinfoto') + '">'
    + (ph.length ? '<img src="' + esc(ph[0]) + '" alt="' + esc(C.property.name)
        + '" onerror="this.closest(\'.port\').classList.add(\'sinfoto\')">' : '')
    + '<div class="port-tx"><h1>' + esc(C.property.name) + '</h1>'
    + (C.property.tagline ? '<p class="sub">' + esc(nm(C.property.tagline)) + '</p>' : '')
    + '</div></section>';

  var cuerpo = (about ? '<section class="sx" id="lacasa"><div class="col"><p class="rot">' + t('navHouse')
        + '</p><p class="about">' + esc(about) + '</p></div></section>' : '')
    + (ph.length > 1 ? '<section class="sx" id="fotos"><div class="col-ancho"><div class="gal">'
        + ph.slice(1, 7).map(function(u){
            return '<img src="' + esc(u) + '" alt="' + esc(C.property.name) + '" loading="lazy" onerror="this.remove()">';
          }).join('') + '</div></div></section>' : '');

  var h = '<h2 class="sec">' + t('reserve') + '</h2>'
    + '<p class="secsub">' + t('reserveSub') + '</p>'
    + '<div class="steps">' + st + '</div>';
  // cab es el encabezado de la sección, que va a todo el ancho por encima de
  // las dos columnas; h se reinicia para que recoja sólo el contenido del paso.
  var r = (S.ci && S.co) ? q() : null, izq = '', der = '', cab = h; h = '';

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
    izq = h; h = '';
    if(r && r.ok) der = summary();
    else {
      // Sin fechas no hay total, pero sí hay una cifra que el huésped quiere:
      // desde cuánto sale la noche. Un hueco vacío aquí no ayuda a decidir.
      var base = BookingPricing.seasonFor(C, today());
      der = '<div class="vacia"><b>' + t('from') + ' ' + moneyCur(Math.round(base.nightly)) + '</b>'
        + '<em>' + t('perNight') + ' · ' + t('min') + ' ' + base.minNights + ' ' + t('nights') + '</em>'
        + '<p>' + t('pickDates') + '</p></div>'
        + (r && r.error === 'minNights' ? '<div class="miss"><b>' + t('minStay') + '</b>' + t('minStayTxt').replace('{n}', r.minNights) + '</div>'
           : r && r.error === 'unavailable' ? '<div class="miss">' + t('unavail') + '</div>' : '');
    }
    der += '<div class="bn"><button class="bp" onclick="go(' + (hasExtras ? 1 : 2) + ')"' + (r && r.ok ? '' : ' disabled') + '>' + t('cont') + '</button></div>';
  }
  if(S.step === 1){
    h += '<h2>' + t('addTitle') + '</h2><p class="h2s">' + t('addSub') + '</p>';
    C.extras.forEach(function(x){
      var on = !!S.ad[x.id], unit = x.unit === 'night' ? t('perNight') : x.unit === 'guest' ? t('perGuest') : t('perStay');
      h += '<button class="ad' + (on ? ' on' : '') + '" onclick="S.ad[\'' + x.id + '\']=!S.ad[\'' + x.id + '\'];R()"><div class="bx">' + (on ? '✓' : '') + '</div><div class="tx"><b>' + esc(nm(x.name)) + '</b><span>' + esc(nm(x.desc)) + '</span></div><div class="pr">' + money(x.price) + ' ' + unit + '</div></button>';
    });
    izq = h; h = '';
    der = summary() + '<div class="bn"><button class="bs" onclick="go(0)">' + t('back') + '</button><button class="bp" onclick="go(2)">' + t('cont') + '</button></div>';
  }
  if(S.step === 2){
    var mode = (C.payment && C.payment.mode) || 'demo', due = r && r.ok ? r.dueNow : 0;
    h += '<h2>' + t('detTitle') + '</h2><p class="h2s">' + t('detSub') + '</p>'
      + '<div class="r2"><div class="fl"><label class="lb">' + t('name') + ' *</label><input value="' + esc(S.nm) + '" oninput="setF(\'nm\',this.value)" autocomplete="name"></div>'
      + '<div class="fl"><label class="lb">' + t('email') + ' *</label><input type="email" value="' + esc(S.em) + '" oninput="setF(\'em\',this.value)" autocomplete="email"></div></div>'
      + '<div class="fl"><label class="lb">' + t('phone') + ' *</label><input type="tel" value="' + esc(S.ph) + '" oninput="setF(\'ph\',this.value)" autocomplete="tel"></div>'
      + '<div class="fl"><label class="lb">' + t('notes') + '</label><textarea oninput="S.nt=this.value" placeholder="' + esc(t('notesPh')) + '">' + esc(S.nt) + '</textarea></div>'
      ;
    izq = h; h = '';
    // La casilla del contrato va junto al botón de pagar, no al final del
    // formulario: es lo último que se acepta antes de soltar el dinero.
    der = summary()
      + '<label class="agr" id="agrBox"><input type="checkbox"' + (S.ag ? ' checked' : '') + ' onchange="setF(\'ag\',this.checked)"><span>' + t('accept') + ' *</span></label>'
      + '<div class="miss" id="missBox" style="display:none"></div>'
      + (S.err ? '<div class="miss">' + esc(S.err) + '</div>' : '')
      + '<div class="bn"><button class="bs" onclick="go(' + (hasExtras ? 1 : 0) + ')">' + t('back') + '</button><button class="bp" id="payBtn" onclick="submit()">'
      + (S.busy ? t('processing') : mode === 'whatsapp' ? t('request') : t('pay') + ' · ' + moneyCur(due)) + '</button></div>'
      + (mode === 'stripe' ? '<p style="margin-top:12px;font-size:11.5px;color:var(--mute);text-align:center">' + t('secure') + '</p>' : '');
  }
  // Sólo se promete pago seguro cuando de verdad cobra Stripe: decirlo en
  // modo demostración sería mentirle al huésped.
  var ico = {
    candado:'<svg viewBox="0 0 24 24"><rect x="4" y="10.5" width="16" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>',
    hoja:'<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>',
    enlace:'<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 4.5 16.8L21 21l-1.2-4.5A9 9 0 0 0 12 3z"/></svg>',
    etiqueta:'<svg viewBox="0 0 24 24"><path d="M3 12.5 12.5 3H21v8.5L11.5 21z"/><circle cx="16.8" cy="7.2" r="1.3"/></svg>'
  };
  var tarjetas = [];
  if(modo === 'stripe') tarjetas.push([ico.candado, t('cSecure'), t('cSecureTxt')]);
  tarjetas.push([ico.etiqueta, t('cDirect'), t('cDirectTxt')]);
  tarjetas.push([ico.hoja, t('cRules'), t('cRulesTxt')]);
  if(tarjetas.length < 3 && wa) tarjetas.push([ico.enlace, t('cAnswer'), t('cAnswerTxt')]);
  var confianza = '<section class="sx"><div class="col"><div class="conf">'
    + tarjetas.slice(0, 3).map(function(x){
        return '<div>' + x[0] + '<b>' + x[1] + '</b><span>' + x[2] + '</span></div>';
      }).join('') + '</div></div></section>';

  a.innerHTML = cabecera + portada + cuerpo
    + '<section class="sx" id="reservar"><div class="col libre">' + cab
    + '<div class="reserva"><div class="rz-main">' + izq + '</div>'
    + '<aside class="rz-side">' + der + '</aside></div></div></section>'
    + confianza + pie;
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
