#!/bin/bash
set -exuo pipefail

# Default tag to use when choosing the Cornerstone3D release to download
CORNERSTONE_VERSION="${CORNERSTONE_VERSION:-v1.27.2}"

##
## Required dependencies (apt install):
##
## - build-essential (yarn install uses node-gyp which will require make)
## - curl
## - nodejs & yarn (corepack enable)
##

# Build in a temp directory
OUTDIR=$PWD/build
BUILDDIR=/tmp/cnsbuilder

cd /tmp
mkdir -p $BUILDDIR
cd $BUILDDIR
rm -rf cornerstone

# Download and extract the Cornerstone3D library
curl -L "https://github.com/cornerstonejs/cornerstone3D/archive/refs/tags/$CORNERSTONE_VERSION.tar.gz" | \
  tar -xz --one-top-level=cornerstone --strip-components=1

# Install dependencies
cd cornerstone

# Ensure we have yarn classic installed
corepack enable && corepack prepare yarn@1.22.19 --activate

# Remove the docs package completely, saving us a "yarn workspace docs remove puppeteer"
# but also because otherwise the shallow install with --non-interactive will fail complaining about versions
rm -rf packages/docs

# Remove non-essential dependencies that cause CI build failures on arm64
# - `puppeteer` tries to install Chrome
# - `resemblejs` pulls in `canvas` on node which has native deps not available for arm64
# - `netlify-cli` pulls in `unix-dgram` which also fails the gyp build
# - `lerna` pulls in `@parcel/watcher` which doesn't seem to fail the build but worth removing still just in case
yarn remove -W resemblejs puppeteer netlify-cli lerna

# The --focus parameter lets us install only this one workspace
cd packages/dicomImageLoader
yarn install --focus --non-interactive --ignore-scripts

# Patches the `decodeImageFrame` import in `createImage` to load the `noWorkers` version
sed -i.old -e "s|from './decodeImageFrame'|from './decodeImageFrame-noWorkers'|" ./src/imageLoader/createImage.ts

# Patches `decodeJPEGBaseline8BitColor.ts` to not use the `this` object inside the `onload` handler
# Node-canvas' Image polyfill does not attach the correct context to the callback function when it calls it
sed -i.old -e "s|drawImage(this as any|drawImage(img as any|" ./src/imageLoader/decodeJPEGBaseline8BitColor.ts

# We patch to remove the workered bundle entrypoint from the default build
# to avoid split chunks and reduce build time
sed -i -e "s|cornerstoneDICOMImageLoader: './imageLoader/index.ts',||" ./.webpack/webpack-bundle.js 

# This means we don't have to run a custom command either
yarn run webpack:bundle

# Copy the built asset back into the app directory
mkdir -p $OUTDIR
echo '*' > $OUTDIR/.gitignore
cp $BUILDDIR/cornerstone/packages/dicomImageLoader/dist/cornerstoneDICOMImageLoaderNoWebWorkers.bundle.min.js $OUTDIR/cornerstoneImageLoader.js

# Cleanup
rm -rf $BUILDDIR
