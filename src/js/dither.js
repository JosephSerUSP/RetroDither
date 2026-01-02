/**
 * Collection of dithering strategies (error diffusion and ordered).
 * @namespace
 */
export const DitherStrategies = {
    /**
     * Helper to distribute quantization error to neighboring pixels.
     * @param {Uint8ClampedArray} data - The image pixel data.
     * @param {number} idx - Current pixel index.
     * @param {number} w - Image width.
     * @param {number} h - Image height.
     * @param {number} dx - X offset for error distribution.
     * @param {number} dy - Y offset for error distribution.
     * @param {number} factor - Error distribution factor.
     * @param {number} errR - Red error component.
     * @param {number} errG - Green error component.
     * @param {number} errB - Blue error component.
     */
    _distribute: (data, idx, w, h, dx, dy, factor, errR, errG, errB) => {
        const targetIdx = idx + (dy * w + dx) * 4;
        if(targetIdx < data.length && targetIdx > 0) {
            data[targetIdx] += errR * factor;
            data[targetIdx+1] += errG * factor;
            data[targetIdx+2] += errB * factor;
        }
    },
    'none': () => {},
    'bayer2': () => {},
    'bayer4': () => {},
    'bayer8': () => {},
    'bluenoise': () => {}, // Handled as ordered dither
    'floyd': (data, idx, w, h, er, eg, eb) => {
        const d = DitherStrategies._distribute;
        d(data, idx, w, h, 1, 0, 7/16, er, eg, eb);
        d(data, idx, w, h, -1, 1, 3/16, er, eg, eb);
        d(data, idx, w, h, 0, 1, 5/16, er, eg, eb);
        d(data, idx, w, h, 1, 1, 1/16, er, eg, eb);
    },
    'falsefloyd': (data, idx, w, h, er, eg, eb) => {
        const d = DitherStrategies._distribute;
        d(data, idx, w, h, 1, 0, 3/8, er, eg, eb);
        d(data, idx, w, h, 0, 1, 3/8, er, eg, eb);
        d(data, idx, w, h, 1, 1, 2/8, er, eg, eb);
    },
    'atkinson': (data, idx, w, h, er, eg, eb) => {
        const d = DitherStrategies._distribute;
        const f = 1/8;
        d(data, idx, w, h, 1, 0, f, er, eg, eb);
        d(data, idx, w, h, 2, 0, f, er, eg, eb);
        d(data, idx, w, h, -1, 1, f, er, eg, eb);
        d(data, idx, w, h, 0, 1, f, er, eg, eb);
        d(data, idx, w, h, 1, 1, f, er, eg, eb);
        d(data, idx, w, h, 0, 2, f, er, eg, eb);
    },
    'jjn': (data, idx, w, h, er, eg, eb) => {
        const d = DitherStrategies._distribute;
        d(data, idx, w, h, 1, 0, 7/48, er, eg, eb); d(data, idx, w, h, 2, 0, 5/48, er, eg, eb);
        d(data, idx, w, h, -2, 1, 3/48, er, eg, eb); d(data, idx, w, h, -1, 1, 5/48, er, eg, eb);
        d(data, idx, w, h, 0, 1, 7/48, er, eg, eb); d(data, idx, w, h, 1, 1, 5/48, er, eg, eb); d(data, idx, w, h, 2, 1, 3/48, er, eg, eb);
        d(data, idx, w, h, -2, 2, 1/48, er, eg, eb); d(data, idx, w, h, -1, 2, 3/48, er, eg, eb);
        d(data, idx, w, h, 0, 2, 5/48, er, eg, eb); d(data, idx, w, h, 1, 2, 3/48, er, eg, eb); d(data, idx, w, h, 2, 2, 1/48, er, eg, eb);
    },
    'sierra': (data, idx, w, h, er, eg, eb) => {
        const d = DitherStrategies._distribute;
        d(data, idx, w, h, 1, 0, 2/4, er, eg, eb); d(data, idx, w, h, -1, 1, 1/4, er, eg, eb); d(data, idx, w, h, 0, 1, 1/4, er, eg, eb);
    },
    'stucki': (data, idx, w, h, er, eg, eb) => {
        const d = DitherStrategies._distribute;
        const f = 1/42;
        d(data, idx, w, h, 1,0, 8*f, er, eg, eb); d(data, idx, w, h, 2,0, 4*f, er, eg, eb);
        d(data, idx, w, h, -2,1, 2*f, er, eg, eb); d(data, idx, w, h, -1,1, 4*f, er, eg, eb); d(data, idx, w, h, 0,1, 8*f, er, eg, eb); d(data, idx, w, h, 1,1, 4*f, er, eg, eb); d(data, idx, w, h, 2,1, 2*f, er, eg, eb);
        d(data, idx, w, h, -2,2, 1*f, er, eg, eb); d(data, idx, w, h, -1,2, 2*f, er, eg, eb); d(data, idx, w, h, 0,2, 4*f, er, eg, eb); d(data, idx, w, h, 1,2, 2*f, er, eg, eb); d(data, idx, w, h, 2,2, 1*f, er, eg, eb);
    }
};

/**
 * Generates a Blue Noise texture using a high-pass filtered white noise approach.
 * @param {number} w - Width
 * @param {number} h - Height
 * @returns {number[][]} - 2D array of values 0..(w*h-1)
 */
export const generateBlueNoise = (w, h) => {
    let size = w * h;
    let data = new Float32Array(size);
    for(let i=0; i<size; i++) data[i] = Math.random();

    // Iterative high-pass filter
    for(let k=0; k<10; k++) {
        let blur = new Float32Array(size);
        for(let y=0; y<h; y++) {
            for(let x=0; x<w; x++) {
                let sum = 0;
                let count = 0;
                for(let dy=-1; dy<=1; dy++) {
                    for(let dx=-1; dx<=1; dx++) {
                        let nx = (x + dx + w) % w;
                        let ny = (y + dy + h) % h;
                        sum += data[ny*w + nx];
                        count++;
                    }
                }
                blur[y*w + x] = sum / count;
            }
        }

        for(let i=0; i<size; i++) data[i] -= blur[i];

        // Histogram Equalization
        let indices = new Int32Array(size);
        for(let i=0; i<size; i++) indices[i] = i;
        indices.sort((a,b) => data[a] - data[b]);

        for(let i=0; i<size; i++) {
            data[indices[i]] = i / size; // Normalized 0..1
        }
    }

    let matrix = [];
    for(let y=0; y<h; y++) {
        let row = [];
        for(let x=0; x<w; x++) {
            // Scale to 0..(size-1) for consistency with Bayer logic needing large range if dim is large
            row.push(data[y*w + x] * size);
        }
        matrix.push(row);
    }
    return matrix;
};
