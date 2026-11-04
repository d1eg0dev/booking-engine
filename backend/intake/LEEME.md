# Script de recepción de altas

Esta carpeta es la que `clasp` sincroniza con el Apps Script que recibe el
formulario. Sólo va aquí lo que pertenece a ese script.

`backend/Code.gs` **no** va aquí: ese es el backend de cobros que se despliega
una vez por cliente, en su propio proyecto. Si acaban juntos, el script de
recepción carga funciones de cobro que no le tocan.

    clasp pull            # trae lo que hay en el servidor
    clasp push            # sube lo de aquí
    clasp deploy -i <id>  # publica una versión nueva de la implementación

El `scriptId` vive en `.clasp.json`, en la raíz. No es una credencial: es el
identificador del proyecto, el mismo que sale en la URL del editor. La
credencial es `~/.clasprc.json`, que se queda en tu máquina y no se sube.
