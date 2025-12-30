export const DitherStrategies = {
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
    'bluenoise': () => {}, // Handled specially in the main loop like bayer
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
    },

    /**
     * Generates a 64x64 Blue Noise texture using high-pass filtered white noise.
     * @returns {Float32Array} Normalized noise values (0-1).
     */
    generateBlueNoise: () => {
        const size = 64;
        const area = size * size;
        const whiteNoise = new Float32Array(area);

        // 1. Generate White Noise
        for(let i=0; i<area; i++) whiteNoise[i] = Math.random();

        // 2. High-pass filter (approximate by subtracting blurred version)
        // Simple box blur for speed in worker init
        const blurred = new Float32Array(area);
        const k = 1; // Kernel radius

        for(let y=0; y<size; y++) {
            for(let x=0; x<size; x++) {
                let sum = 0;
                let count = 0;
                for(let dy=-k; dy<=k; dy++) {
                    for(let dx=-k; dx<=k; dx++) {
                        let nx = (x + dx + size) % size;
                        let ny = (y + dy + size) % size;
                        sum += whiteNoise[ny * size + nx];
                        count++;
                    }
                }
                blurred[y*size + x] = sum / count;
            }
        }

        // 3. Subtract and Normalize
        const result = new Float32Array(area);
        let min = Infinity, max = -Infinity;

        for(let i=0; i<area; i++) {
            let val = whiteNoise[i] - blurred[i];
            result[i] = val;
            if(val < min) min = val;
            if(val > max) max = val;
        }

        // Normalize to 0-1
        const range = max - min;
        for(let i=0; i<area; i++) {
            result[i] = (result[i] - min) / range;
        }

        return result;
    }
};
