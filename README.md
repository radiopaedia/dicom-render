# dicom-render

Using [Cornerstone.js](https://www.cornerstonejs.org/) on the server-side to rasterize [DICOM](https://www.dicomstandard.org/) images into raw metadata and windowed pixel data.

This library is created for and used extensively with [Radiopaedia's](https://radiopaedia.org) image handling that aims to make content accessible to end users, while also ensuring that content authors may use the image formats and tools they are already used to when uploading new content to the website.

Cornerstone.js is used by Radiopaedia to preview and allow adjustments for DICOM source files on the client-side (in-browser). Once anonymization has taken place the source DICOMs are uploaded and stored on the server and transcoded into more web-accessible formats for viewing. Because of this we wanted to ensure maximum compatibility between two sides of this workflow (on the browser and on the backend), hence we elected to run the Cornerstone.js library -- originally designed for client-side viewing -- to generate our image renderings on the server as well.


## What does it do?

`dicom-render.js` is a [Node.js](https://nodejs.org) executable. It takes a DICOM file as its input (either on `stdin` or passed via file path passed as an argument), and produces metadata and rasterized pixel data in the JSON format on its `stdout`.

Please note that, unless passed the `--quiet` runtime option, `dicom-render.js` will log debugging/metadata info onto the stdout as well, potentially causing issues for software trying to parse its output on `stdout` as valid JSON.

The original `pixelData` and the `windowedPixelData` is returned in the returned JSON object as an array of individual bytes. The window/level configuration is read from the DICOM source file, but adding the ability to specify a custom window/level config for the renderer is among the planned features. In cases where no windowing makes sense, both arrays contain the same value. For color images (see `color` property in the output) the arrays are serialized as 3-channel 8 bit per channel RGB (3 bytes/pixel), for grayscale images the output is 8-bit single-channel (1 byte/pixel).

Please note that `dicom-render.js` currently does not produce images of any particular encoding, the resultant pixel data is rendered to images by other components of Radiopaedia's image pipeline, though a rudimentary image export (mostly intended for debugging) is planned.


## Usage

To run use either `./dicom-render.js` or `node dicom-render.js`. By default the DICOM image is expected to be received over `stdin` and output will be produced on `stdout`.

Available commandline parameters:

- `--debug`: turns on debugging on `stderr`
- `--perf`: turns on performance traces, execution of various phases will be tracked and a summary will be printed on `stderr` at the end of execution
- `--output=<json|jpeg>`: the output format. Defaults to JSON serialized metadata/pixeldata. JPEG images can also be produced (this uses [sharp](https://github.com/lovell/sharp), a library with native dependencies)


## How does it work?

Various components of the Cornerstone.js library contribute to making the magic happen, while several constraints of Radiopaedia affect how this library was implemented.


### `yarn install`

The library uses `yarn` for dependency management, please note that one of the installed dependencies ([`canvas`](https://www.npmjs.com/package/canvas)) uses native dependencies, which may cause issues on non-`x86_64` platforms.

Radiopaedia servers run on the `arm64` platform so many additional steps are taken to ensure that the build works on ARM platforms.

### `yarn build`

This step will involve two build steps: customizing Cornerstone.js and building the final executable.


### [`install.sh`](./install.sh)

Due to the fact that Cornerstone.js has been built only with client-side (browser) support in mind, few tweaks are needed to allow the library to run under Node.js.

We wanted to keep our changes to as close to the original library as possible, hence these changes are applied to build-time patches in `install.sh` which downloads a designated release of the Cornerstone.js source, applies few modifications, and then builds a custom version of [`dicomImageLoader`](https://github.com/cornerstonejs/cornerstone3D/tree/main/packages/dicomImageLoader). This library is used internally by Cornerstone.js to load a DICOM image file into memory.

A few changes are applied to the downloaded repository and the `dicomImageLoader` source before using the included `webpack` configuration to build a new version of the library. These changes are verbosely documented in the `install.sh` script and serve two broad purposes:

- Creating a Node.js-compatible build of the library (primarily by removing [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)-related codepaths, which are unsupported and not needed for this usecase anyway)
- Simplifying the build process, primarily to allow it to run on `arm64` machines

*Please note that we hope that the upstream project is amenable to changes that would make it possible to run `Cornerstone.js` / the `dicomImageLoader` library on the serverside with even fewer or no modifications at all, supporting the server-side usecase out of the box, and we hope that with that we can remove many of these workarounds in the future.*

### `rollup`

Besides the custom `dicomImageLoader` library we use an upstream version of [`Cornerstone3D`](https://github.com/cornerstonejs/cornerstone3D) installed from npm. To be able to run this library in Node.js again, various tweaks and shims must be provided to convince the Cornerstone.js library that it is actually running in a web browser. If we are successful, Cornerstone.js will load the provided DICOM image, will render it on a virtual canvas and we can read out the rendered pixeldata. This is easier said than done as many DOM-related features of the web platform need to be emulated or re-implemented to allow for this. These tweaks are found in [`rollup.shims.js`](./rollup.shims.js).

`rollup` then takes these shims, [stubs out](./rollup.config.mjs) a couple other unnecessary dependencies that may cause problems and then uses the upstream libraries (installed in `node_modules`) and the custom `dicomImageLoader` to create a final library in the `dist` folder.

This `dist/dicom.js` library is the brains of the operation, and `dicom-render.js` just uses the exposed methods to load and render an image, it is considered largely boilerplate / consumer.

*Note: currently there is event handling code in `dicom-render.js` that should actually reside in the build library, moving this over is on the list of improvements planned in the near future.*

## Additional notes

### A note on GPU-rendering

Latest versions of Cornerstone.js support GPU-rendering, greatly improving browser performance of the library. This feature takes advantage of the graphics processor of the computer using the WebGL API and makes the user experience of displaying and animating images much more fluid.

Unfortunately the WebGL API is not supported on Node.js (nor do backends usually have access to a GPU), hence this library triggers the "CPU fallback" rendering mode of Cornerstone.js, which uses the Canvas API for image display. Since display performance is not important in our case (but pixel-perfect reproduction **is**) we want to explicitly avoid using the GPU-rendered code path altogether.

### A note on the `canvas` dependency

Technically we don't need this library, particularly its native `Cairo` graphics rendering backend, as we are only interested in the raw pixel data that makes its way onto the canvas. Exploring removing this dependency (and much build and runtime complexity) is also planned for future library versions, as that would also speed up execution besides the significantly reduced complexity.

In case the talks with the upstream developers go well and providing first-class server-side access to some of this functionality may be implemented upstream, than this "hack" will no longer be needed and that could be also a way forward in this case.

## arm64 cross-build

It is possible to build dicom-render for arm64 locally using [multi-platform Docker builds](https://docs.docker.com/build/building/multi-platform/):

```
docker run --privileged --rm tonistiigi/binfmt --install arm64
docker build --platform linux/arm64 -t dicomrender .
```

The resulting arm64 image can be run as e.g.:

```
docker run -i --rm --platform linux/arm64 dicomrender --output=jpeg <input.dcm >output.jpg
```

Note that this feature uses QEMU (emulation) so the code will run significantly slower than it would on a native ARM platform.
