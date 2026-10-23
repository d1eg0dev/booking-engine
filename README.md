# Motor de reservas · marca blanca

Sistema de reserva directa que se instala para cualquier villa, casa u hotel boutique. El huésped elige fechas, agrega extras y paga en el sitio del propio dueño. No lleva la marca de WD Studio salvo que se active (`brand.poweredBy`).

**Regla de oro:** por cliente solo se edita `config.json`. El widget (`index.html`), el motor de precios (`pricing.js`) y el backend (`backend/Code.gs`) son iguales para todos. El backend recalcula el precio con el mismo `config.json`, así que el precio que ve el huésped y el que cobra Stripe nunca se separan (el problema que tuvimos en Papelillo).

## Qué incluye

| Pieza | Qué hace |
|---|---|
| `index.html` | El widget: calendario con precio por noche, temporadas, mínimo de noches, huéspedes, mascotas, extras, datos del huésped, contrato y pago. Bilingüe (ES/EN). Funciona solo o dentro de un iframe en el sitio del cliente. |
| `config.json` | Todo lo de la propiedad: nombre, logo, colores, tipografía, idiomas, moneda, temporadas, limpieza, mascotas, impuestos, extras, porcentaje a cobrar, calendarios iCal, fechas bloqueadas, contacto y política. |
| `pricing.js` | El cálculo del precio. Se usa en el navegador y se copia al backend. |
| `backend/Code.gs` | Google Apps Script ligado a una Google Sheet: disponibilidad (iCal de Airbnb/Booking/VRBO + hoja "Bloqueos" + reservas pagadas), pago con Stripe Checkout, confirmación, correos al huésped y al dueño, y correo de recuperación de reservas abandonadas cada hora. |
| `tools/intake.html` | El formulario que llena el cliente. Al terminar descarga un `config.json` ya armado: no hay que transcribir nada. |
| `tools/new-client.py` | Crea la carpeta de un cliente nuevo. |
| `tools/build-backend.py` | Regenera `backend/Code.gs` si se cambia `pricing.js`. |

## Dos planes (`plan`)

- `renta` · Booking Page, 79 USD o 1,399 MXN + IVA al mes. La plantilla con los colores, la tipografía y el logo del cliente. Sin extras ni cargo por mascota: el formulario los oculta y manda `extras: []` y `maxPets: 0`, y el widget se salta ese paso solo. No activar la recuperación de reservas abandonadas (no correr el activador horario de `setup`).
- `compra` · Booking link, integrado o landing + booking. Todo lo anterior más extras, mascotas, recuperación de reservas y diseño a la medida.

El logo llega como enlace de Drive o Dropbox, que no sirve directo en `<img>`. Descargarlo, subirlo a la carpeta del cliente (`logo.png` o `logo.svg`) y poner esa ruta en `property.logo`.

## Tres modos de pago (`payment.mode`)

- `demo` · no cobra; sirve para enseñarlo a prospectos.
- `whatsapp` · el huésped manda su solicitud ya calculada por WhatsApp. Sin Stripe y sin backend (si hay backend, además la registra en la hoja). Ideal para el paquete Booking Link o para intermediarios.
- `stripe` · cobro real. Necesita el backend y las llaves de Stripe del dueño. `payment.chargePercent` define si se cobra todo (100) o un anticipo (p. ej. 30).

## Cliente nuevo en 15 minutos

0. **Mandarle el formulario al cliente:** `tools/intake.html` (publicado, o el archivo por correo). Lo llena, descarga su `config.json` y lo devuelve junto con el enlace de sus fotos.
1. **Crear la carpeta:** `python3 tools/new-client.py casa-luna "Casa Luna"`.
2. **Llenar `config.json`:** si llegó del formulario, solo reemplazarlo y revisar. Si no: nombre, frase, logo, colores, temporadas y tarifas, limpieza, extras, contacto, política. Fechas en formato `AAAA-MM-DD`.
   - Antes de publicar, revisar el bloque `_intake`: `policyNeedsTranslation` o `taglineNeedsTranslation` en `true` significa que falta la versión en inglés. Borrar `_intake` al terminar.
3. **Publicar:** subir la carpeta a un repo nuevo de GitHub → Settings → Pages → rama `main`. Queda en `https://<usuario>.github.io/casa-luna/` (o con su dominio).
4. **Probar en modo `demo`** y mandarle el enlace al cliente para que lo apruebe.
5. **Para cobrar de verdad (modo `stripe`):**
   1. Crear una Google Sheet nueva en la cuenta del cliente → Extensiones → Apps Script.
   2. Pegar todo `backend/Code.gs`.
   3. En Configuración del proyecto → Propiedades del script, agregar `CONFIG_URL` (la URL pública del `config.json`), `STRIPE_SECRET_KEY` (la del cliente; nunca va en el repo) y `OWNER_EMAIL`.
   4. Ejecutar `setup` una vez (crea las hojas "Reservas" y "Bloqueos" y el activador horario de reservas abandonadas) y aceptar los permisos.
   5. Implementar → Nueva implementación → Aplicación web · Ejecutar como: yo · Acceso: cualquier persona. Copiar la URL que termina en `/exec`.
   6. En `config.json` poner esa URL en `backendUrl`, los enlaces iCal en `availability.icalUrls` y `payment.mode: "stripe"`.
   7. Hacer una reserva de prueba con llaves de prueba de Stripe (`sk_test_…` y la tarjeta 4242 4242 4242 4242) antes de pasar a `sk_live_…`.
6. **Insertar en su sitio:** `<iframe src="https://<usuario>.github.io/casa-luna/" style="width:100%;min-height:1100px;border:0"></iframe>`, o un botón "Reservar" que abra el enlace.

## Lo que el dueño puede cambiar solo

- Bloquear fechas: agregar una fila en la hoja "Bloqueos" (desde, hasta, nota).
- Ver reservas: hoja "Reservas" (estado Pendiente de pago, Pagada o Solicitud por WhatsApp).
- Precios, temporadas y extras: se cambian en `config.json` (el backend lo lee solo en 5 minutos). Es soporte nuestro, no del dueño.

## Seguridad

- La llave secreta de Stripe vive solo en las Propiedades del script del cliente, nunca en el repo ni en un chat.
- El backend no confía en el precio que manda el navegador: lo recalcula y vuelve a revisar la disponibilidad antes de cobrar.
- El repo puede ser público (GitHub Pages gratis lo requiere): no contiene llaves.
