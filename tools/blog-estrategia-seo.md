# Blog de Booking Page · estrategia SEO

Investigación del 21 de noviembre de 2026, hecha leyendo los resultados de búsqueda reales en
español e inglés. **No hay datos de volumen de búsqueda**: no se usaron Google Keyword
Planner, Ahrefs ni Semrush. Las prioridades salen de quién ocupa hoy cada búsqueda y de qué
tan específica es. Cuando tengamos Search Console con datos, esta tabla se corrige con
números de verdad.

## Lo que muestran los resultados

1. **Las búsquedas genéricas ya tienen dueño.** "Reservas directas", "sitio web de
   reservas directas" y "direct booking website" los ocupan empresas de software grandes
   (Hostfully, iGMS, Smoobu, Lodgify, PriceLabs, Holidu, Guesty). Competir de frente con
   artículos genéricos no tiene sentido.
2. **Casi todo lo que hay en español está escrito para España** ("alquiler vacacional",
   "piso", "IRPF"). Para México hay muy poco escrito con su vocabulario ("renta vacacional",
   "reservación", "alberca", "SAT", pesos). Ese hueco es nuestra mejor entrada.
3. **Tendencia del año: la tarifa única de Airbnb para anfitriones.** En 2026 Airbnb está
   moviendo a todos los anfitriones a una sola tarifa cobrada al anfitrión: 15.5 % en la
   mayoría de países y 16 % en México y Brasil, según su centro de ayuda. Mucha gente busca
   "cuánto cobra Airbnb", "comisión Airbnb 2026" o "host only fee". Es la puerta de entrada
   que más tráfico promete.
4. **Airbnb prueba comisiones más bajas para reservas que traes tú con tu propio enlace.**
   Es noticia (Skift, agosto de 2026) y se puede escribir sin atacar a nadie.
5. **Google Vacation Rentals da enlaces de reserva gratis** hacia la web del alojamiento.
   Para salir ahí hace falta un socio de conectividad. Es un tema de interés, pero no se
   puede prometer que Booking Page lo consigue.
6. **Booking.com no publica una comisión única.** Las guías dan una comisión base del 15 %
   y un rango del 10 al 25 % según país y programa, más un cargo si usas Pagos por
   Booking.com. Cualquier cifra de Booking necesita su fuente y su fecha.

## Mapa de palabras clave

Un artículo apunta a **una** frase principal (`palabra_clave`). Las demás de su grupo van en
los subtítulos y en el texto, sin forzar.

### Español (prioridad México)

| Grupo | Frase principal | Variantes | Intención | Prioridad |
| --- | --- | --- | --- | --- |
| Comisiones | comisión de airbnb | cuánto cobra Airbnb a anfitriones 2026, tarifa única Airbnb México 16 % | Informativa, tráfico alto | Alta |
| Comisiones | comisión de booking | cuánto cobra Booking a un alojamiento, pagos por Booking.com | Informativa | Alta |
| Comisiones | comisión vrbo | cuánto cobra Vrbo al anfitrión | Informativa | Media |
| Reserva directa | reservas directas | reservaciones directas renta vacacional, cómo recibir reservas directas | Media, competida | Media (siempre con ángulo México) |
| Reserva directa | página de reservas propia | página web para mi casa de renta, sitio de reservas para villa | Comercial | Alta |
| Operación | sincronizar calendario airbnb y booking | iCal Airbnb Booking, evitar doble reserva | Problema concreto | Alta |
| Operación | política de cancelación propia | cancelación Airbnb opciones, reglas de la casa | Informativa | Media |
| Operación | cobrar con stripe renta vacacional | cobrar con tarjeta a huéspedes, pago directo | Comercial | Media |
| Huésped | huéspedes que repiten | fidelizar huéspedes, base de datos de huéspedes | Informativa | Media |
| Fiscal México | retención isr airbnb | IVA renta vacacional, factura huésped | Informativa, delicada | Media (siempre mandando al contador) |
| Por tipo | página de reservas para hotel boutique | web para cabaña, web para villa de lujo, departamento | Comercial | Media |
| Google | google vacation rentals | aparecer en Google con mi casa vacacional | Informativa | Baja-media |

### Inglés

| Grupo | Frase principal | Variantes | Prioridad |
| --- | --- | --- | --- |
| Comisiones | airbnb host fee | airbnb host only fee 2026, how much does airbnb charge hosts | Alta |
| Reserva directa | direct booking | book direct, direct booking website vacation rental | Media (muy competida) |
| Huésped | repeat guests book direct | get guests to book direct, guest list | Alta |
| Operación | sync airbnb and booking calendar | ical double booking | Media |
| México | airbnb host fee mexico | vacation rental mexico direct booking, Stripe Mexico fees | Alta (casi nadie lo escribe) |

## Reglas para cada artículo

- **Título visible (H1):** con emoción y en positivo, como ya escribimos.
- **`titulo_seo`:** de 60 caracteres como máximo, con la frase principal al principio.
  Ejemplo: "Reservas directas: tus huéspedes de Airbnb, con tus reglas".
- **`resumen`:** de 155 caracteres como máximo, con la frase principal. Es lo que se lee en
  Google.
- **Slug:** corto, con la frase principal y sin fecha.
- **Dos imágenes:** la portada (`imagen` + `imagen_alt`) y una dentro del texto con
  `![alt](archivo.jpg)`. Siempre de `landing/blog/media/`, con texto alternativo que
  describa lo que se ve. Nunca fotos bajadas de internet.
- **Enlaces internos:** al menos un enlace a otro artículo del blog y uno a la calculadora.
- **`modificado`:** se actualiza solo cuando cambia el fondo (una tarifa, una cifra), no
  por una coma.
- **Español de México por defecto** (renta, reservación, alberca, pesos), con "alquiler
  vacacional" una vez para que también lo encuentren desde España.

## Lo que ya hace la plantilla (tools/genera-blog.py)

- `<title>`, descripción, canonical y hreflang es/en/x-default en cada página.
- Open Graph y Twitter con imagen grande, fechas de publicación y de modificación.
- JSON-LD con BlogPosting (imagen, autor, editor, fechas, número de palabras), BreadcrumbList
  y Blog en el índice.
- Un sitemap con las versiones en cada idioma, las imágenes y la fecha real de cada página.
- Las imágenes llevan ancho y alto (para que la página no salte al cargar), `srcset` con
  800 y 1600 px, la portada con prioridad y el resto en carga diferida.
- Avisos al construir cuando falta la imagen, el texto alternativo o la frase principal, o
  cuando el título o el resumen son demasiado largos.
- El precio de Booking Page en los anuncios se lee de `landing/index.html`, para que no
  vuelva a quedar desfasado.

## Pendiente fuera de este repo

- Dar de alta `https://wdstudio.agency/booking-page/blog/sitemap.xml` en Google Search
  Console y comprobar que el `robots.txt` de wdstudio.agency lo menciona.
- Revisar Search Console al mes y corregir este mapa con las búsquedas reales que traen
  visitas.
