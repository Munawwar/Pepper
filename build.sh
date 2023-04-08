rm -fr dist
mkdir -p dist/cjs
mkdir -p dist/browser
esbuild pepper.js --outfile=dist/cjs/pepper.cjs --format=cjs
esbuild pepper.js --outfile=dist/browser/pepper.min.js --minify --bundle --target=es2020 --format=iife --global-name=Pepper --sourcemap