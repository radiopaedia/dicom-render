// Shims for the server
if (typeof process !== 'undefined') {
    // vtk.js uses this for DOM input handling
    // https://github.com/thewtex/vtk-js/blob/master/Sources/Rendering/Core/RenderWindowInteractor/index.js#L14
    globalThis.MouseEvent = function() {};
 
    // Webpack publicPath runtime shim
    globalThis.importScripts = true; globalThis.location = '/dicom.js';
 
    // dicomImageLoader.wadouri.loadImage uses this
    globalThis.currentScript = { src: '/dicom.js' };

    // var DEFAULT_VIEW_API = navigator.gpu ? 'WebGPU' : 'WebGL';
    globalThis.navigator = {
        userAgent: '"Mozilla/5.0 (Node.js, DICOM on the Server)"',
        gpu: 'none',
    };

    // cornerstoneWADOImageLoader uses the Filereader API which is not supported in Node.js
    // Polyfill enough of the API to get wadouri.loadFileRequest working
    globalThis.FileReader = class FileReaderShim {
        constructor() {}
        readAsArrayBuffer(fileButReallyOnlyBlobs) {
            // This should happen async as the event handlers may not be attached yet
            // Using an arrow function to keep [this] intact
            const task = () => {
                if (typeof fileButReallyOnlyBlobs !== 'object' || fileButReallyOnlyBlobs instanceof Blob === false) {
                    console.error('[rollup.shims.js] Invalid value supplied readAsArrayBufferShim (should be Blob)', fileButReallyOnlyBlobs);
                } else {
                    console.log('[rollup.shims.js] Converted Blob back to ArrayBuffer', fileButReallyOnlyBlobs);
                    if (!this.onload || typeof this.onload !== 'function') {
                        return console.error('[rollup.shims.js] No onload callback found.');
                    }
                    fileButReallyOnlyBlobs.arrayBuffer().then(buffer => {
                        this.result = buffer;
                        this.onload({ target: this });
                    });
                }
            }
            // Basically "setTimeout(task, 0)"
            // https://nodejs.org/en/learn/asynchronous-work/understanding-setimmediate
            setImmediate(task);
        }
    }

    // decodeImageFrame sets "pako" on the window object but it doesn't exist in Node
    // https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/master/src/imageLoader/decodeImageFrame.js#L9
    // Note: some modules do browser-detection using the window property so this might end up being problematic
    if ('window' in globalThis) {
        console.log('globalThis already has a window property');
    } else {
        Object.defineProperty(globalThis, 'window', {
            get() {
                return globalThis
            }
        });
    }
    // Webpack checks for "self || window", which breaks because self is not defined in Node
    // This check may only happen if WebWorkers enabled (which they shouldn't) but can't hurt to keep the shim either way
    if ('self' in globalThis) {
        console.log('globalThis already has a self property');
    } else {
        Object.defineProperty(globalThis, 'self', {
            get() {
                return globalThis
            }
        });
    }
 
    let renderCanvas, renderCanvasElement;

    // https://github.com/cornerstonejs/cornerstone3D/blob/main/packages/core/src/RenderingEngine/helpers/getOrCreateCanvas.ts
    const qs = (selector) => {
        switch (selector) {
            // viewport element
            case 'div.viewport-element':
                console.log('[rollup.shims.js] QuerySelector:', selector);
                return { querySelector: qs };
            // rendering engine canvas
            case 'canvas.cornerstone-canvas':
                console.log('[rollup.shims.js] QuerySelector:', selector);
                return renderCanvasElement;
        }

        console.warn('[rollup.shims.js] WARNING! Unknown querySelector selector received:', selector);
        return null;
    }

    // RequestAnimationFrame mini-polyfill
    globalThis.requestAnimationFrame = (callback) => {
        console.log('[rollup.shims.js] Scheduled requestAnimationFrame');
        setTimeout(callback, 16);
    }
    globalThis.Image = class ImageShim {
        constructor() {
            console.log(`[rollup.shims.js] new Image(${Array.from(arguments).join(',')})`);
            return new document._Image(arguments)
        }
    }


    globalThis.document = {
        _canvas: null,
        _eventCallback: null,
        _listen(cb) {
            this._eventCallback = cb
        },  
        createElement(element) {
            if (element?.toLowerCase() === 'canvas') {
                let newCanvas, newCanvasElement;

                // Uses the Deno skia_canvas library CreateCanvas method that we expose on the
                // document global to create a new functioning Canvas when running in Deno
                newCanvas = document._createCanvas(300,150);
                console.log('[rollup.shims.js] Created a new '+(renderCanvas?'utility':'primary')+' <'+element+'>:', newCanvas);
//                console.log('Context:', newCanvas.getContext("2d"));

                // In prototype
                newCanvasElement = Object.create(
                    newCanvas,
                    {
                        // Ensure the "this" object of getContext("2d") calls is unchanged
                        getContext: {
                            get: () => newCanvas.getContext.bind(newCanvas)
                        },
                        // We need to keep track of width/height so we can apply the correct values to
                        // clientWidth/clientHeight when queried
                        // We only do this on the primary renderCanvas as we only need to fix the behavior there
                        // and the other canvases will break under node-canvas with a wrapper
                        width: {
                            get: () => {
                                console.log('[rollup.shims.js] Canvas width queried, was ', newCanvas.width);
                                return newCanvas.width;
                            },
                            set: (v) => {
                                console.log('[rollup.shims.js] Canvas width set to', v);
                                newCanvas.width = v;
                            }
                        },
                        height: {
                            get: () => {
                                console.log('[rollup.shims.js] Canvas height queried, was ', newCanvas.height);
                                return newCanvas.height;
                            },
                            set: (v) => {
                                console.log('[rollup.shims.js] Canvas height set to', v);
                                newCanvas.height = v;
                            }
                        },
                    }
                );

                // clientWidth/Height will always return canvas dimensions because otherwise
                // cornerstone fits the canvas dimensions to the client dimensions
                // https://github.com/cornerstonejs/cornerstone3D/blob/19d7d73eca5190a6bd81429a5a1858c500946d61/packages/core/src/RenderingEngine/RenderingEngine.ts#L825C59-L825C59
                Object.defineProperty(newCanvasElement,'clientWidth', {
                    get: () => {
                        console.log('[rollup.shims.js] ClientWidth queried', newCanvas.width);
                        return newCanvas.width;
                    }
                });
                Object.defineProperty(newCanvasElement,'clientHeight', {
                    get: () => {
                        console.log('[rollup.shims.js] ClientHeight queried', newCanvas.height);
                        return newCanvas.height;
                    }
                });

                // The first canvas that is created is set as the "primary" render canvas,
                // it will be accessible on document._canvas
                // Cornerstone may create other utility canvases while rendering
                if (!renderCanvas) {
                    renderCanvas = newCanvas;
                    renderCanvasElement = newCanvasElement;
                    this._canvas = renderCanvasElement;
                    return newCanvasElement;
                }

                // We only modify the renderCanvas, as utility canvases may be used in drawImage calls
                // and will fail under node-canvas because it expects native node-canvas objects
                return newCanvas;
            }

            console.log('[rollup.shims.js] Created a new stub <'+element+'> element');
            return {
                _attrs: {},
                querySelector: qs,
                setAttribute(attr,val) {
                    console.log('[rollup.shims.js] Attribute "'+attr+'" was set to ', val);
                    this._attrs[attr] = val;
                },
                dispatchEvent(event) {
                    console.log('[rollup.shims.js] Event dispatch was requested:', event);
                    const dispatch = globalThis.document._eventCallback;
                    if (typeof dispatch === 'function') dispatch(event);
                }
            };
        }
    };
}
