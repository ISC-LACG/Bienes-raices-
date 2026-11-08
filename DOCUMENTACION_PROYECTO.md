# Bienes Raíces: guía técnica del proyecto

Este documento explica cómo funciona el proyecto hasta este punto del curso, qué tecnologías utiliza y cómo se relacionan Docker, Gulp, Sass, Modernizr y los directorios `src` y `build`.

## 1. Arquitectura general

El flujo del proyecto es:

```text
Archivos que editamos
        src/
          │
          ▼
   Gulp + Sass + Sharp + Terser
          │
          ▼
Archivos para el navegador
        build/
```

- `src/` es la fuente de verdad. Aquí se editan SCSS, JavaScript e imágenes.
- `build/` contiene archivos generados. Se puede borrar porque Gulp lo reconstruye.
- Los HTML están en la raíz y cargan archivos de `build/`.
- `node_modules/` contiene herramientas de desarrollo, no código que debamos editar.

Ejemplo de referencia correcta desde HTML:

```html
<link rel="stylesheet" href="build/css/app.css">
<script src="build/js/bundle.min.js"></script>
```

## 2. Tecnologías utilizadas

| Tecnología | Responsabilidad |
|---|---|
| HTML | Estructura y contenido de las páginas. |
| SCSS / Dart Sass | Organización del CSS mediante variables, mixins y módulos. |
| Gulp 5 | Automatización de compilación y observación de cambios. |
| PostCSS | Ejecuta transformaciones sobre el CSS compilado. |
| Autoprefixer | Añade prefijos CSS requeridos por navegadores compatibles. |
| cssnano | Minimiza el CSS. |
| JavaScript | Comportamiento del sitio y detección de características. |
| Modernizr | Detecta soporte WebP y añade clases al elemento `<html>`. |
| Terser | Minimiza JavaScript. |
| Sharp | Optimiza imágenes y genera WebP y AVIF. |
| Node.js 24 | Entorno donde se ejecutan Gulp y sus dependencias. |
| Docker | Crea un entorno reproducible sin instalar Node globalmente. |
| Docker Compose | Configura y administra el contenedor de desarrollo. |

## 3. Sass: `@use` y `@forward`

### El problema de `@import`

La forma antigua de combinar archivos Sass era:

```scss
@import 'base/variables';
@import 'base/mixins';
```

`@import` colocaba todas las variables y mixins en un espacio global. En proyectos grandes esto podía provocar nombres duplicados, dependencias difíciles de identificar y archivos evaluados más de una vez. Sass lo marcó como obsoleto.

### Qué hace `@use`

`@use` carga un módulo y permite utilizar directamente sus miembros públicos. Normalmente crea un namespace:

```scss
@use '../base/variables' as v;

.header {
    background-color: v.$grisOscuro;
}
```

Aquí:

- `variables` es el módulo cargado.
- `v` es un alias corto.
- `$grisOscuro` pertenece explícitamente a `v`.

Para mixins funciona de la misma forma:

```scss
@use '../base/mixins' as m;

.barra {
    @include m.tablet {
        display: flex;
    }
}
```

Ventajas de `@use`:

- Cada módulo se evalúa una sola vez.
- Evita contaminar el espacio global.
- Hace visible de dónde viene cada variable o mixin.
- Detecta nombres duplicados con mayor claridad.
- Permite configurar módulos y ocultar miembros internos.

Las instrucciones `@use` deben escribirse antes de cualquier regla CSS del archivo.

También existe `as *`:

```scss
@use '../base/variables' as *;
```

Esto permite escribir `$grisOscuro` sin namespace, pero pierde parte de la claridad de los módulos. En este proyecto preferimos aliases como `v` y `m`.

### Qué hace `@forward`

`@forward` no se utiliza principalmente para consumir variables. Su función es volver a publicar miembros de otros módulos.

Supongamos esta estructura:

```text
scss/
└── base/
    ├── _index.scss
    ├── _variables.scss
    └── _mixins.scss
```

El archivo `base/_index.scss` podría contener:

```scss
@forward 'variables';
@forward 'mixins';
```

Otro archivo podría cargar ambos mediante un solo punto de entrada:

```scss
@use '../base' as b;

.elemento {
    color: b.$negro;

    @include b.tablet {
        display: grid;
    }
}
```

La diferencia esencial es:

| Instrucción | Función |
|---|---|
| `@use` | Carga un módulo para utilizarlo en el archivo actual. |
| `@forward` | Vuelve a exportar módulos para que otros archivos los consuman. |

`@forward` es útil para crear archivos índice o *barrel files*. Este proyecto todavía es pequeño y usa `@use` directamente; agregar `_index.scss` sería opcional, no un requisito.

### Miembros privados

Sass considera privado un miembro cuyo nombre comienza con `_` o `-`:

```scss
$color-publico: #000;
$_color-interno: #333;
```

`@forward` exportaría `$color-publico`, pero no `$_color-interno`.

### División moderna con `math.div`

La división antigua:

```scss
padding: $separacion / 2;
```

se reemplazó por:

```scss
@use 'sass:math';

padding: math.div(v.$separacion, 2);
```

Esto evita la ambigüedad entre división matemática y el carácter `/` válido en CSS.

## 4. Cómo funciona `gulpfile.js`

Gulp trabaja con streams de archivos:

```text
src(...) → transformaciones .pipe(...) → dest(...)
```

### Tarea `css`

```text
SCSS → Dart Sass → Autoprefixer → cssnano → build/css
```

- Sass convierte SCSS en CSS.
- Autoprefixer añade compatibilidad según sus reglas de navegadores.
- cssnano minimiza el resultado.

### Tarea `javascript`

```text
src/js/*.js → concatenación → Terser → bundle.min.js
```

Los archivos JavaScript se reúnen en un solo bundle y Terser lo minimiza. El HTML debe cargar `build/js/bundle.min.js`.

### Tarea `imagenes`

Optimiza los formatos que ya existen:

- JPEG: calidad 80, progresivo y compresión MozJPEG.
- PNG: compresión y paleta optimizada.
- WebP existente: calidad 80.

Los originales de `src/img` no se modifican. El resultado se escribe en `build/img`.

### Tarea `formatos`

Para cada JPG o PNG genera adicionalmente:

```text
imagen.jpg
├── imagen.webp
└── imagen.avif
```

WebP y AVIF se generan en paralelo. AVIF ofrece buena compresión, pero su codificación hace que el primer arranque tarde más.

### `encoding: false`

Gulp 5 lee texto como UTF-8 por defecto. Las imágenes son datos binarios, así que deben cargarse así:

```js
src(paths.imagenes, { encoding: false })
```

Sin esa opción, bytes válidos de JPEG o PNG podrían convertirse en caracteres de texto y Sharp recibiría una imagen corrupta.

### Tarea `watchArchivos`

Mantiene Gulp ejecutándose y responde a cambios:

| Cambio | Tarea ejecutada |
|---|---|
| SCSS | `css` |
| JavaScript | `javascript` |
| JPG, PNG o WebP | `imagenes` |
| SVG | `svg` |
| JPG o PNG | `formatos` |

### Tarea `default`

`npm run dev` ejecuta `gulp`, y Gulp busca `exports.default`:

```js
exports.default = series(
    parallel(css, javascript, imagenes, svg, formatos),
    watchArchivos
);
```

- `parallel(...)` construye los recursos simultáneamente.
- `series(...)` espera a que la construcción termine.
- Después inicia `watchArchivos`.

## 5. Modernizr y las clases WebP

Modernizr comprueba si el navegador soporta WebP y modifica el elemento `<html>`.

Navegador con soporte:

```html
<html class="webp">
```

Navegador sin soporte:

```html
<html class="no-webp">
```

Esto permite seleccionar el fondo adecuado:

```scss
.no-webp .inicio {
    background-image: url('../img/header.jpg');
}

.webp .inicio {
    background-image: url('../img/header.webp');
}
```

Modernizr está en `src/js/modernizr.js` y termina dentro de `build/js/bundle.min.js`.

## 6. Dockerfile

El `dockerfile` describe cómo construir la imagen:

```dockerfile
FROM node:24
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "run", "dev"]
```

Paso a paso:

1. Parte de una imagen oficial con Node.js 24.
2. Establece `/app` como directorio de trabajo.
3. Copia primero los archivos de dependencias para aprovechar la caché de Docker.
4. `npm ci` instala exactamente las versiones del `package-lock.json`.
5. Copia el código permitido por `.dockerignore`.
6. Al iniciar el contenedor ejecuta `npm run dev`.

`npm ci` se usa en entornos reproducibles. Si el lock y `package.json` no coinciden, falla en lugar de cambiar versiones silenciosamente.

## 7. Docker Compose

`compose.yaml` administra el servicio `node`.

### Montaje del proyecto

```yaml
volumes:
  - .:/app
```

Conecta la carpeta local con `/app`. Por eso un cambio hecho en el editor aparece inmediatamente dentro del contenedor.

### Volumen de dependencias

```yaml
volumes:
  - node_modules:/app/node_modules
```

`node_modules` queda en un volumen de Docker. Esto evita mezclar dependencias del host con las del contenedor Linux.

Consecuencia importante: borrar una posible carpeta `node_modules` del host no elimina el volumen. Para eliminarlo deliberadamente:

```bash
docker compose down -v
```

### Usuario

```yaml
user: "1000:1000"
```

Hace que los archivos generados pertenezcan al usuario local habitual y no a `root`.

### Polling

```yaml
CHOKIDAR_USEPOLLING: "true"
```

Ayuda a detectar cambios de archivos a través de montajes Docker cuando los eventos nativos del sistema no se propagan correctamente.

## 8. Qué hace `.dockerignore`

`.dockerignore` controla qué archivos no se envían al motor de Docker durante `docker build`.

Contenido actual:

```text
.git
.gitignore
.gulp-cache
build
node_modules
npm-debug.log*
```

Beneficios:

- Reduce el contexto de construcción y acelera `docker build`.
- Evita copiar dependencias del host sobre las instaladas con `npm ci`.
- Evita incluir Git y archivos generados dentro de la imagen.
- Mejora el uso de la caché de capas.

`.dockerignore` no controla los volúmenes y no elimina archivos locales. Solo afecta el contenido enviado durante la construcción de la imagen.

Comparación:

| Archivo | Afecta a |
|---|---|
| `.gitignore` | Archivos que Git no debe versionar. |
| `.dockerignore` | Archivos que Docker no debe recibir durante el build. |

## 9. Comandos habituales

Crear o reconstruir e iniciar:

```bash
docker compose up -d --build
```

Ver solamente logs producidos desde ese momento:

```bash
docker compose logs -f --tail=0
```

Ver las últimas 20 líneas y continuar:

```bash
docker compose logs -f --tail=20
```

Detener sin eliminar:

```bash
docker compose stop
```

Reanudar el mismo contenedor:

```bash
docker compose start
```

Detener y eliminar el contenedor, conservando dependencias:

```bash
docker compose down
```

Eliminar también el volumen de dependencias:

```bash
docker compose down -v
```

Comprobar dependencias y seguridad:

```bash
docker compose run --rm node npm outdated
docker compose run --rm node npm audit
```

## 10. Qué se versiona

Debe versionarse:

- HTML.
- `src/`.
- `gulpfile.js`.
- `package.json` y `package-lock.json`.
- `dockerfile`, `compose.yaml` y `.dockerignore`.
- Esta documentación.

No debe versionarse:

- `node_modules/`, porque se reconstruye con npm.
- `build/`, porque se reconstruye con Gulp.
- Logs y cachés locales.

La regla práctica es: si puede reproducirse a partir de archivos fuente y configuración, normalmente no necesita guardarse como artefacto generado en Git.
