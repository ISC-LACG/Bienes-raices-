const { src, dest, watch, parallel } = require('gulp');

const sass = require('gulp-sass')(require('sass'));
const autoprefixer = require('autoprefixer');
const postcss = require('gulp-postcss');
const sourcemaps = require('gulp-sourcemaps');
const cssnano = require('cssnano');

const concat = require('gulp-concat');
const terser = require('gulp-terser-js');
const rename = require('gulp-rename');

const cache = require('gulp-cache');
const sharp = require('sharp');
const path = require('path');
const plumber = require('gulp-plumber');
const through2 = require('through2');


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
    return src(paths.scss)
        .pipe(sourcemaps.init())
        .pipe(
            sass({
                quietDeps: true,
                silenceDeprecations: ['import']
            }).on('error', sass.logError)
        )
        .pipe(postcss([
            autoprefixer(),
            cssnano()
        ]))
        .pipe(sourcemaps.write('.'))
        .pipe(dest('build/css'));
}


// ==========================================
// JAVASCRIPT
// ==========================================

function javascript() {
    return src(paths.js)
        .pipe(sourcemaps.init())
        .pipe(concat('bundle.js'))
        .pipe(terser())
        .pipe(rename({
            basename: 'bundle.min'
        }))
        .pipe(dest('build/js'))
        .pipe(rename({
            extname: '.map'
        }))
        .pipe(dest('build/js'));
}


// ==========================================
// OPTIMIZACIÓN DE IMÁGENES
// ==========================================

function sharpTransform() {

    return through2.obj(async (file, _, cb) => {

        if (file.isNull()) {
            return cb(null, file);
        }

        if (file.isStream()) {
            return cb(new Error('Streams no soportados'));
        }

        const ext = path.extname(file.path).toLowerCase();

        try {

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

            const buffer = await pipeline.toBuffer();

            file.contents = buffer;

            cb(null, file);

        } catch (err) {

            cb(err);

        }
    });
}


// ==========================================
// PROCESAR IMÁGENES
// ==========================================

function imagenes() {

    const stream = src(paths.imagenes, {
        allowEmpty: true
    })
        .pipe(plumber())
        .pipe(cache(sharpTransform()))
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
        allowEmpty: true
    })
        .pipe(dest('build/img'));
}


// ==========================================
// CONVERTIR JPG/PNG A WEBP
// ==========================================

async function convertirWebp(ruta) {

    const outputPath = ruta
        .replace('src/img', 'build/img')
        .replace(/\.(jpe?g|png)$/i, '.webp');

    await sharp(ruta)
        .webp({
            quality: 50,
            effort: 4
        })
        .toFile(outputPath);
}


// ==========================================
// CONVERTIR JPG/PNG A AVIF
// ==========================================

async function convertirAvif(ruta) {

    const outputPath = ruta
        .replace('src/img', 'build/img')
        .replace(/\.(jpe?g|png)$/i, '.avif');

    await sharp(ruta)
        .avif({
            quality: 50,
            effort: 4
        })
        .toFile(outputPath);
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
    watch(
        'src/img/**/*.{jpg,jpeg,png}',
        async function generarFormatos(ruta) {

            try {

                await convertirWebp(ruta);
                await convertirAvif(ruta);

                console.log(
                    `✓ WebP y AVIF generados: ${path.basename(ruta)}`
                );

            } catch (error) {

                console.error(
                    `✗ Error procesando ${path.basename(ruta)}:`,
                    error.message
                );

            }
        }
    );
}


// ==========================================
// EXPORTAR TAREAS
// ==========================================

exports.css = css;
exports.javascript = javascript;
exports.imagenes = imagenes;
exports.svg = svg;
exports.watchArchivos = watchArchivos;


// ==========================================
// TAREA POR DEFECTO
// ==========================================

exports.default = parallel(
    css,
    javascript,
    imagenes,
    svg,
    watchArchivos
);