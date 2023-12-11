import {
  loadImageFile,
  loadImageBlob,
  imageMetadata,
  imageWindowRanges,
  renderImage
} from './build/dicom.js';

// Load a file from an URL and display it
// display(await loadImageFile(
//   new URL('./assets/dicom/0.dcm', import.meta.url)
// ));

// CornerstoneJS container
const cornerstoneElement = document.createElement('div');
cornerstoneElement.id = 'cornerstone-element';
document.body.appendChild(cornerstoneElement);

// Load a file from the local machine and display it
document.querySelector('input[type=file]')?.addEventListener('change', load);

async function load(event) {
  const files = event.target.files;
  if (files.length) {
    display(await loadImageBlob(files[0]));
  }
}

async function display(dicomImage) {
  const dicomId = dicomImage.imageId

  //const dicomMeta = imageMetadata(dicomId);
  //console.log('Image metadata for ', dicomId, dicomMeta)

  //const dicomWindow = imageWindowRanges(dicomId)
  //console.log('Embedded VOI window ranges:', dicomWindow);

  // Size display element to image dimensions
  cornerstoneElement.style.width = dicomImage.width+'px';
  cornerstoneElement.style.height = dicomImage.height+'px';

  await renderImage(dicomImage, cornerstoneElement);
}
