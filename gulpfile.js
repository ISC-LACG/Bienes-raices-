/**
 * Pipeline de desarrollo del proyecto Bienes Raíces.
 *
 * Código fuente: src/
 * Archivos que consume el navegador: build/
 *
 * `npm run dev` ejecuta la tarea default al final del archivo:
 * primero construye todos los recursos y después observa cambios.
 */
const { src, dest, watch, parallel, series } = require('gulp');

// CSS: Dart Sass compila SCSS; PostCSS añade prefijos y minimiza el resultado.
const sass = require('gulp-sass')(require('sass'));
const autoprefixer = require('autoprefixer');
const postcss = require('gulp-postcss');
const cssnano = require('cssnano');

// JavaScript: Terser minimiza y gulp-rename añade el sufijo `.min`.
const terser = require('gulp-terser');
const rename = require('gulp-rename');

// Imágenes y utilidades para transformar los archivos de los streams de Gulp.
const sharp = require('sharp');
const path = require('path');
const plumber = require('gulp-plumber');
const through2 = require('through2').default;


// ==========================================
// RUTAS
// ==========================================

const paths = {
    scss: 'src/scss/**/*.scss',
    js: 'src/js/**/*.js',

    // Imágenes que vamos a optimizar con Sharp
    imagenes: 'src/img/**/*.{jpg,jpeg,png,webp}',

    // Archivos que solamente queremos copiar
    svg: 'src/img/**/*.svg'
};


// ==========================================
// CSS / SASS
// ==========================================

function css() {
    // app.scss es el punto de entrada, pero observamos todos los parciales para
    // recompilar cuando cambie cualquier archivo dentro de src/scss.
    return src(paths.scss)
        .pipe(
            sass({
                quietDeps: true
            }).on('error', sass.logError)
        )
        .pipe(postcss([
            // Compatibilidad con navegadores mediante prefijos como -webkit-.
            autoprefixer(),
            // Reduce el tamaño del CSS final.
            cssnano()
        ]))
        .pipe(dest('build/css'));
}


// ==========================================
// JAVASCRIPT
// ==========================================

function javascript() {
    // Gulp 5 utiliza Vinyl 3. Esta transformación reemplaza a gulp-concat,
    // cuyo árbol de dependencias antiguo producía avisos deprecados.
    let archivoSalida;
    const contenidos = [];

    const concatenar = through2.obj(
        function (file, _, cb) {
            if (file.isBuffer()) {
                // Conservamos los metadatos del primer archivo y acumulamos el
                // contenido de todos los JS separados por un salto de línea.
                archivoSalida ??= file.clone({ contents: false });
                contenidos.push(file.contents, Buffer.from('\n'));
            }
            cb();
        },
        function (cb) {
            if (archivoSalida) {
                // El stream vuelve a emitir un único archivo: bundle.js.
                archivoSalida.path = path.join(archivoSalida.base, 'bundle.js');
                archivoSalida.contents = Buffer.concat(contenidos);
                this.push(archivoSalida);
            }
            cb();
        }
    );

    return src(paths.js, { encoding: false })
        .pipe(concatenar)
        .pipe(terser())
        .pipe(rename({
            suffix: '.min'
        }))
        .pipe(dest('build/js'));
}


// ==========================================
// OPTIMIZACIÓN DE IMÁGENES
// ==========================================

function sharpTransform() {

    return through2.obj(function (file, _, cb) {

        if (file.isNull()) {
            return cb(null, file);
        }

        if (file.isStream()) {
            return cb(new Error('Streams no soportados'));
        }

        const ext = path.extname(file.path).toLowerCase();

        // Sharp trabaja en memoria y devuelve otro Buffer; nunca modifica el
        // archivo original guardado en src/img.
        let pipeline = sharp(file.contents, {
            failOnError: false
        });

        // JPG / JPEG
        if (ext === '.jpg' || ext === '.jpeg') {

            pipeline = pipeline.jpeg({
                quality: 80,
                progressive: true,
                mozjpeg: true
            });

        }

        // PNG
        else if (ext === '.png') {

            pipeline = pipeline.png({
                quality: 80,
                compressionLevel: 9,
                effort: 7,
                palette: true
            });

        }

        // WEBP
        else if (ext === '.webp') {

            pipeline = pipeline.webp({
                quality: 80,
                effort: 4
            });

        }

        pipeline.toBuffer()
            .then((buffer) => {
                file.contents = buffer;
                cb(null, file);
            })
            .catch(cb);
    });
}


// ==========================================
// PROCESAR IMÁGENES
// ==========================================

function imagenes() {

    const stream = src(paths.imagenes, {
        allowEmpty: true,
        // Obligatorio para binarios en Gulp 5. Sin esto, intentaría leer las
        // imágenes como texto UTF-8 y dañaría sus bytes antes de llegar a Sharp.
        encoding: false
    })
        // Evita que un error de imagen cierre por completo el proceso watch.
        .pipe(plumber())
        .pipe(sharpTransform())
        .pipe(dest('build/img'));

    stream.on('end', () => {
        console.log('✓ Imágenes optimizadas correctamente');
    });

    return stream;
}


// ==========================================
// COPIAR SVG
// ==========================================

function svg() {

    return src(paths.svg, {
        allowEmpty: true,
        encoding: false
    })
        .pipe(dest('build/img'));
}


// ==========================================
// GENERAR WEBP Y AVIF
// ==========================================

function formatos() {

    return src('src/img/**/*.{jpg,jpeg,png}', {
        allowEmpty: true,
        encoding: false
    })
        .pipe(plumber())
        .pipe(through2.obj(function (file, _, cb) {
            const extension = path.extname(file.path);
            const nombre = path.basename(file.path, extension);
            const webp = file.clone();
            const avif = file.clone();

            // Ambas conversiones se ejecutan en paralelo para cada original.
            Promise.all([
                sharp(file.contents)
                    .webp({ quality: 50, effort: 4 })
                    .toBuffer(),
                sharp(file.contents)
                    .avif({ quality: 50, effort: 4 })
                    .toBuffer()
            ])
                .then(([webpBuffer, avifBuffer]) => {
                    webp.path = path.join(file.base, `${nombre}.webp`);
                    webp.contents = webpBuffer;
                    avif.path = path.join(file.base, `${nombre}.avif`);
                    avif.contents = avifBuffer;

                    this.push(webp);
                    this.push(avif);
                    cb();
                })
                .catch(cb);
        }))
        .pipe(dest('build/img'));
}


// ==========================================
// WATCH
// ==========================================

function watchArchivos() {

    // SCSS
    watch(paths.scss, css);

    // JavaScript
    watch(paths.js, javascript);

    // JPG / JPEG / PNG / WEBP
    watch(paths.imagenes, imagenes);

    // SVG
    watch(paths.svg, svg);

    // Generar WEBP y AVIF cuando cambie un JPG/PNG
    watch('src/img/**/*.{jpg,jpeg,png}', formatos);
}


// ==========================================
// EXPORTAR TAREAS
// ==========================================

exports.css = css;
exports.javascript = javascript;
exports.imagenes = imagenes;
exports.svg = svg;
exports.formatos = formatos;
exports.watchArchivos = watchArchivos;


// ==========================================
// TAREA POR DEFECTO
// ==========================================

exports.default = series(
    // La construcción inicial se ejecuta en paralelo. `series` garantiza que
    // watchArchivos empiece solamente cuando todos los artefactos ya existen.
    parallel(css, javascript, imagenes, svg, formatos),
    watchArchivos
);
