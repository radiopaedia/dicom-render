#!/usr/bin/env node

// IMPORTS
import { checkpoint, results, total } from './lib/perf.js';
import './lib/debugging.js';
import { imageMetadata, loadImageFile, loadImageBlob, renderImage } from './build/dicom.js';
import sharp from 'sharp';

// Read version from package.json
// NOTE: The API has recently changed from 'assert' to 'with', Node version prior 20.10 may fail to recognize it
// NOTE: Experimental feature, will print a warning on STDERR
// https://nodejs.org/dist/latest-v20.x/docs/api/esm.html#import-attributes
import packageConfig from './package.json' with { type: 'json' };

// Output format
let OUTPUT_FORMAT = 'json';

const document = globalThis.document;

// Initialization completed
checkpoint('init-done');


async function renderToJPEG(renderedImage, jpegOptions) {
	const { width, height, data } = renderedImage;

	const jpegImage = await sharp(data, {
		raw: {
			width,
			height,
			channels: 4 // Canvas image data is RGBA
		}
	})
		.flatten() // default background is black
		.jpeg(jpegOptions ?? {
			mozjpeg: true,
			quality: 99
		})
		.toBuffer()

	checkpoint('result-ready');

	process.stdout.write(jpegImage);
	checkpoint('result-sent');
	results();
}

async function serializeToJSON(dicomImage, renderedImage) {
	// Query additional metadata
	const dicomMeta = imageMetadata(dicomImage.imageId);

	checkpoint('metadata-fetched');

	// Note: DICOMLoaderIImage, values produced by imageLoader/createImage.ts
	// https://github.com/cornerstonejs/cornerstone3D/blob/main/packages/dicomImageLoader/src/imageLoader/createImage.ts#L279
	const {
		color, // the value from isColorImage()
		columnPixelSpacing, // imagePlaneModule.columnPixelSpacing
		intercept, // modalityLutModule.rescaleIntercept || 0
		slope, // modalityLutModule.rescaleSlope || 1
		invert, // imageFrame.photometricInterpretation === 'MONOCHROME1'
		rowPixelSpacing, // imagePlaneModule.rowPixelSpacing
		windowCenter, // voiLutModule.windowCenter ? voiLutModule.windowCenter[0] : undefined
		windowWidth, // voiLutModule.windowWidth ? voiLutModule.windowWidth[0] : undefined

		imageFrame,
	} = dicomImage;

	// Processed output pixel data
	let windowedPixelData
	const pxdata = renderedImage.data;

	// Color image (samplesPerPixel = 3, photometricInterpretation = RGB (or others))
	if (color) {
		// We drop the alpha channel from pxdata to create the 3-channel output RGB array
		windowedPixelData = new Uint8Array(pxdata.length - (pxdata.length >> 2));

		let srcIdx = 0;
		let idx = 0;
		while (idx < pxdata.length) {
			windowedPixelData[idx] = pxdata[srcIdx];
			windowedPixelData[idx + 1] = pxdata[srcIdx + 1];
			windowedPixelData[idx + 2] = pxdata[srcIdx + 2];
			srcIdx += 4;
			idx += 3;
		}

	// Grayscale image (samplesPerPixel = 1, photometricInterpretation = MONOCHROME(1|2) )
	} else {
		// pxdata is 4-channel RGBA, our output is single-channel luma/grayscale
		windowedPixelData = new Uint8Array(pxdata.length >> 2);

		let idx = 0;
		while (idx < pxdata.length) {
			windowedPixelData[idx >> 2] = pxdata[idx];
			idx += 4;
		}
	}

	/* The following fields are required by the go CornerstoneImage struct:
	   From `dicomMeta.imagePixelModule`
	    - samplesPerPixel
	    - photometricInterpretation
	    - rows
	    - columns
	    - bitsAllocated
	    - bitsStored
	    - highBit
	    - pixelRepresentation
	    - smallestPixelValue
	    - largestPixelValue

	   From `dicomImage`:
		- color
		- invert

		- columnPixelSpacing
		- rowPixelSpacing

		- intercept
		- slope
		- windowCenter
		- windowWidth

		- pixelData
		- windowedPixelData
	*/
	const ret = {
		...dicomMeta.imagePixelModule,

  		minPixelValue: imageFrame.smallestPixelValue,
  		maxPixelValue: imageFrame.largestPixelValue,

  		// TODO: do we actually support color images?
		color,
		invert,

		columnPixelSpacing,
		rowPixelSpacing,

		intercept,
		slope,
		windowCenter,
		windowWidth,

  		pixelData: Array.from(imageFrame.pixelData),

  		// Note: this is expected to be RGBA only for color images,
  		// the Go function accounts for rows/columns/samplesPerPixel from imagePixelModule
  		// TODO: what happens for images with samplesPerPixel>1 ?
  		windowedPixelData: Array.from(windowedPixelData),
	}
	checkpoint('result-ready');
	total('total-processing');
	const processingPerformance = results(false);
	if (processingPerformance) {
		ret._perf = processingPerformance;
	}

	const out = JSON.stringify(ret);
	process.stdout.write(new TextEncoder().encode(out));
	checkpoint('result-sent');
	results();
}


// Output version info and exit
if (process.argv[process.argv.length-1] === '-v') {
	process.stdout.write(JSON.stringify({
		pipeline: `${packageConfig.name}-v${packageConfig.version}`,
		protocol_version: 1
	}));
	process.exit(0);
}

// Last argument must be a .dcm filename to load, otherwise expecting it via stdin
const fileName = process.argv.length>2 && !process.argv[process.argv.length-1].startsWith('-') ? process.argv[process.argv.length-1] : null;

// Output format (defaults to JSON-serialization)
if (process.argv.includes('--output=jpeg')) {
	OUTPUT_FORMAT = 'jpeg'
}

// Load file
let dicomImage;
if (fileName) {
	// Load a DICOM image from the given path (using Fetch)
	// Note: currently doesn't work with Node.js v20.10
	try {
		dicomImage = await loadImageFile(new URL(fileName, import.meta.url));

	}
	catch (e) {
		console.error(e)
		console.log('Note: local file loading with fetch() is not yet implemented in Node.js')
		exit(1)
	}

// Read stdin
} else {
	dicomImage = await new Promise((resolve, reject) => {
		const chunks = [];
		let bytes = 0;

		process.stdin.on('data', (chunk) => {
			chunks.push(chunk);
			bytes += chunk.length;
		});

		process.stdin.on('end', () => {
			// We can create a blob directly out of these chunks
			const stdinBlob = new Blob(chunks);

			// Load DICOM image straight from the Blob data
			loadImageBlob(stdinBlob).then(
				r => {
					resolve(r)
				}
			).catch(reject);
		});
	})
}

checkpoint('image-loaded');

checkpoint('render-start');

const renderedImage = await renderImage(dicomImage);
checkpoint('render-complete');

// JPEG rendering
if (OUTPUT_FORMAT === 'jpeg') {
	await renderToJPEG(renderedImage);

// JSON serialization
} else {
	await serializeToJSON(dicomImage, renderedImage);
}
