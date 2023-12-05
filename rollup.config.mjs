// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import inputsourcemaps from 'rollup-plugin-sourcemaps';
import { readFileSync } from 'node:fs';

export default {
	input: 'lib/dicom.js',
	output: {
		file: 'build/dicom.js',
		format: 'es',
        intro: redefines(),
        sourcemap: true,
	},
	plugins: [
        //inputsourcemaps(),
        commonjs(),
        resolve(),
        stubs(),
    ],
    external: [
        // no need to bundle
        'canvas',
    ],
};

// Stub out the globalthis shim
const STUBBED = [
    'globalthis',
    'zlib',
];

function stubs() {
    return {
        name: 'stubs',
        resolveId(src) {
            return STUBBED.includes(src) ? src : null;
        },
        load(src) {
            if (src === 'globalthis') return 'export default () => globalThis;';
            if (src === 'zlib') return 'export default {};';
            return null;
        },
    }
}

// Stub out browser APIs we don't actually need
function redefines() {
    return readFileSync('./lib/rollup.shims.js').toString();
}
