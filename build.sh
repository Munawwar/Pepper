rm -fr dist
mkdir -p dist/cjs
mkdir -p dist/browser/esm/
mkdir -p dist/browser/global/
esbuild src/index.js --outfile=dist/cjs/index.cjs --bundle --format=cjs --sourcemap
esbuild src/index.js --outfile=dist/browser/esm/index.min.js --minify --bundle --target=es2020 --format=esm --sourcemap
esbuild src/index.js --outfile=dist/browser/global/index.min.js --minify --bundle --target=es2020 --format=iife --global-name=PepperModule --sourcemap