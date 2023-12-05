// Unfortunately we need the whole cornerstone core here because the image loader depends on it
// TODO: try to figure out what's actually used and include a limited core?
import * as cornerstone from '@cornerstonejs/core';

import dicomParser from 'dicom-parser';

// '@cornerstonejs/dicom-image-loader' does not work on the server as it uses the default entrypoint that uses Web Workers
// '@cornerstonejs/dicom-image-loader/dist/cornerstoneDICOMImageLoaderNoWebWorkers.bundle.min.js' still won't work work because
// `createImage` invoked by `wadouri.loadImage` will still load the workers

// We create a patched library where `createImage` uses `decodeImageFrame-noWorkers.ts`
import cornerstoneDICOMImageLoader from '../build/cornerstoneImageLoader.js';

// Virtual canvas
import { createCanvas, Image } from 'canvas';

// Expose createCanvas on the global document object so it can be used by shims
document._createCanvas = createCanvas;

// Expose the Image element polyfill
document._Image = Image

// Configure Cornerstone.js
const { RenderingEngine, Types, Enums, metaData } = cornerstone;
const { ViewportType } = Enums;

const { preferSizeOverAccuracy, useNorm16Texture } = cornerstone.getConfiguration().rendering;

cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;

cornerstoneDICOMImageLoader.configure({
  useWebWorkers: false,
  decodeConfig: {
    // TODO: maybe we want these?
    convertFloatPixelDataToInt: false,
    use16BitDataType: preferSizeOverAccuracy || useNorm16Texture,
  },
});



export async function loadImageFile(dicomUrl) {
  const dicomFile = await ( fetch(dicomUrl).then(r => r.blob()) );

  return await loadImageBlob(dicomFile);
}

export async function loadImageBlob(dicomFile) {
  const dicomId = cornerstoneDICOMImageLoader.wadouri.fileManager.add(dicomFile);

  const dicomImageLoad = cornerstoneDICOMImageLoader.wadouri.loadImage(dicomId);
  //const dataSetPromise = dataSetCacheManager.load(parsedImageId.url /*0*/, loader /*loadFileRequest*/, imageId/* dicomfile:0 */);
  console.log('image load started')

  return await dicomImageLoad.promise;
}

export function imageMetadata(dicomId) {
  const imagePixelModule = metaData.get('imagePixelModule', dicomId);
  const {
    pixelRepresentation,
    bitsAllocated,
    bitsStored,
    highBit,
    photometricInterpretation,
  } = imagePixelModule;

  const imagePlaneModule = metaData.get('imagePlaneModule', dicomId);
  const voiLutModule = metaData.get('voiLutModule', dicomId);
  const modalityLutModule = metaData.get('modalityLutModule', dicomId);
  const sopCommonModule = metaData.get('sopCommonModule', dicomId);

  const transferSyntax = metaData.get('transferSyntax', dicomId);

  const metadata = {
    imagePixelModule,
    pixelRepresentation,
    bitsAllocated,
    bitsStored,
    highBit,
    photometricInterpretation,
    imagePlaneModule,
    voiLutModule,
    modalityLutModule,
    sopCommonModule,
    transferSyntax
  };

  return metadata;
}

export function imageWindowRanges(dicomId) {
  const { windowCenter, windowWidth } = metaData.get('voiLutModule', dicomId);

  return windowCenter.map((center, i) => {
    const width = windowWidth[i];
    // (width >> 1) is the equivalent of Math.floor(width / 2), note the parenthesis for precedence
    return { lower: center - (width>>1), upper: center + (width>>1) };
  });
}

export async function renderImage(dicomImage, element) {
  // Resize the rendercanvas to fit the image
  document._canvas.width = dicomImage.width;
  document._canvas.height = dicomImage.height;

  const dicomId = dicomImage.imageId;

  const cornerstoneElement = element ?? document.createElement('div');

  cornerstone.setUseCPURendering(true);
  cornerstone.setUseSharedArrayBuffer(false);

  await cornerstone.init()

  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportId = 'CT_STACK';

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.STACK,
    element: cornerstoneElement,
    defaultOptions: {
      background: [0, 0, 0],
    },
    // Disable image smoothing
    pixelReplication: true,
  });

  const viewport = renderingEngine.getViewport(viewportId);
  await viewport.setStack([dicomId]);

  // set voi LUT to the alternate window (sometimes)
  //viewport.setProperties({
  //  voiRange: dicomWindowRanges()[Math.random()*dicomWindowRanges.length|0]
  //});

  // "viewport.render()" is non-blocking and no promise is generated so we
  // must listen to the dispatched event to know when the rendering is finished
  // Types.ImageRenderedEventDetail
  // https://www.cornerstonejs.org/api/core/namespace/Enums#IMAGE_RENDERED
  const renderedImageDataPromise = new Promise(resolve => {
    // TODO: for one-shot renders this will work but will probably break in weird ways if renderImage is called more than once
    globalThis.document._listen(event => {
      if (event.type === 'CORNERSTONE_IMAGE_RENDERED') {
        const canvas = document._canvas;
        const renderedImagePixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        resolve(renderedImagePixels);
      }
    });
  });

  viewport.render();

  return renderedImageDataPromise;
}
