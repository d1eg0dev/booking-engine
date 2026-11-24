# Mapa de funcionalidades

Para qué sirve esto: un agente al que le reportan un fallo necesita encontrar
la funcionalidad, abrirla y reproducir el fallo por su cuenta. Si tiene que
buscar entre cientos de archivos, o preguntar, el cuello de botella vuelve a
ser la persona. Aquí está dónde vive cada cosa, cómo se llega a ella y cómo se
comprueba.

Regla: si añades una funcionalidad y no la pones aquí, para los agentes no
existe.

---

## Cómo se publica

Nada se sube a mano. `git push` a `main` dispara el flujo
`.github/workflows/blog.yml`, que construye el blog, pasa las barreras, corre
el bucle de comprobación y copia el sitio al repositorio
`d1eg0dev/wdstudio.agency` con `tools/publicar-landing.py`. El Apps Script se
despliega por su propio flujo.

Antes de publicar corren, en este orden y las dos bloqueando:

| Qué | Comando | Qué vigila |
|---|---|---|
| Barreras | `python3 tools/guardrails.py` | Siete reglas que no se pueden saltar, cada una por un fallo real |
| Bucle | `python3 tools/qa-funnel.py` | Que la página en el navegador diga lo mismo que el HTML |

---

## Landing

**Dónde:** `landing/index.html` (español), `landing/en/index.html` (inglés).
Son dos archivos completos, no uno con traducciones: un cambio de copy o de
precio se hace dos veces. La barrera G3 avisa si una de las dos se queda atrás.

**En el navegador:** `wdstudio.agency/booking-page/` y `/booking-page/en/`.

**Partes de dentro:**

| Parte | Cómo encontrarla | Notas |
|---|---|---|
| Calculadora de ahorro | `id="tarifa"`, `id="noches"`, `id="com"`, `id="mon"` | Los resultados están escritos en el HTML y el script los recalcula. Tienen que coincidir: barrera G1 y bucle |
| Resultados | `id="r-ahorro"`, `r-comision`, `r-cuesta`, `r-nota` | Español en pesos, inglés en dólares. No son los mismos números |
| Precios | `id="p-mes"`, `id="p-ano"`, `id="p-ano-nota"` | Base en pesos: `MES_MXN = 1490`, `ANO_MXN = 14900` |
| Tipos de cambio | `FX`, función `precio()` | Se piden al cargar; si falla la petición hay respaldo citado a 18.75 MXN por dólar |
| Pasos | `<ol class="pasos">` | El título tiene que decir tantos pasos como `<li>` haya: barrera G2 |
| Oferta de lanzamiento | `<div class="veinte">` | Tres meses sin costo al contratar el año. Vive también en los legales y en el formulario |
| Enlaces de pago | `buy.stripe.com/...` | Sólo los de `tools/enlaces-pago.json`: barrera G5 |

---

## Demo

**Dónde:** `demo/`, configurado por `demo/config.json`.

**En el navegador:** `wdstudio.agency/booking-page/demo/`.

Es la página de reservas de ejemplo. Sirve de prueba de que el producto existe,
así que un fallo aquí cuesta ventas.

---

## Formulario de alta

**Dónde:** `tools/intake.html`. Se publica como `alta/index.html`.

**En el navegador:** `wdstudio.agency/booking-page/alta/`.

**Cómo se entra:** sólo dos puertas, y las dos las comprueba el servidor, no el
navegador.

1. Pagando: Stripe devuelve al formulario con `?sesion=cs_...`, y el Apps
   Script le pregunta a Stripe si esa sesión está pagada de verdad.
2. Con código: uno de los que reparte Diego, contra su lista en el servidor.

El formulario esconde el botón de publicar a quien no ha pagado, pero eso es
cortesía. Lo que cuenta es la comprobación del Apps Script: cualquiera puede
editar una dirección o mandar la petición a mano.

**Para reproducir un fallo de acceso:** abre la página con `?sesion=cs_falso` y
confirma que el servidor lo rechaza. Si el navegador lo acepta, el fallo es de
cortesía; si el servidor lo acepta, el fallo es grave.

---

## Backend

**Dónde:** `backend/`, Google Apps Script. Se despliega con
`.github/workflows/apps-script.yml`.

- `Intake.gs`: recibe el alta, comprueba quién puede publicar, escribe en la
  hoja y dispara la publicación.
- La publicación de una página nueva sale de aquí: manda un `repository_dispatch`
  de tipo `alta` a este repositorio, que lo recoge `.github/workflows/alta.yml`.

**Secretos:** la llave de Stripe vive en las propiedades del script. El token de
GitHub vive en los secretos del repositorio. Ninguno de los dos se escribe en
un archivo: barrera G4.

---

## Legales

**Dónde:** la fuente es `landing/legal.json`. Las cuatro páginas las escribe
`tools/genera-legal.py`.

**En el navegador:** `/terminos/`, `/privacidad/`, `/en/terms/`, `/en/privacy/`.

Editar el HTML a mano funciona hasta la siguiente regeneración, que borra el
cambio en silencio. La barrera G7 lo detecta: regenera y compara. Lo que se
edita es el JSON.

Tres secciones son obligatorias y la barrera G6 las vigila: que esto es
infraestructura y no intermediación financiera, que las tarjetas las procesa
Stripe bajo PCI-DSS Nivel 1, y el tope de responsabilidad.

---

## Blog

**Dónde:** `landing/blog/posts/*.md`, construido por `tools/genera-blog.py`.

Un agente escribe el `.md` y abre un pull request. El flujo corre en el pull
request sin publicar, y ahí es donde avisan las puertas del generador: un
artículo sin dato propio, demasiado corto, con título repetido o que rompe el
tope semanal tumba la construcción. Es deliberado: lo que Google castiga como
contenido a escala se paga con el dominio, no con el artículo.

---

## Lo que todavía no existe

Para que nadie lo busque:

- Captura de UTMs. No hay una sola referencia a `utm_` en el repositorio.
- Cupón `DIRECTO10` y su lógica por plan.
- Campo de número de propiedades en la calculadora, y el enrutamiento de cinco
  o más a atención comercial.
- Checkout Sessions creadas en el servidor. Hoy son enlaces de pago estáticos,
  que no pueden llevar cupón ni trial variable.
- Stripe Connect con un solo botón.
- Aviso de carrito abandonado.
- FAQ desplegable y el bloque modular de seguros.
