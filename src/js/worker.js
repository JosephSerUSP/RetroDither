import { CONSTANTS } from './constants.js';
import { PALETTES } from './palettes.js';
import { ColorUtils } from './color-utils.js';
import { DitherStrategies } from './dither.js';

// Generate Blue Noise Texture (64x64)
// Using a simplified "Void-and-Cluster" approximation or High-Pass filter approach.
// Here we use a high-pass filtered white noise approach for runtime generation.
const BLUE_NOISE_SIZE = 64;
const BLUE_NOISE = new Uint8Array(BLUE_NOISE_SIZE * BLUE_NOISE_SIZE);

(function generateBlueNoise() {
    const size = BLUE_NOISE_SIZE;
    const count = size * size;
    const white = new Float32Array(count);
    for(let i=0; i<count; i++) white[i] = Math.random();

    // Apply crude high-pass: value - average_of_neighbors
    const result = new Float32Array(count);
    for(let y=0; y<size; y++) {
        for(let x=0; x<size; x++) {
            const idx = y*size + x;
            let sum = 0;
            let n = 0;
            for(let dy=-1; dy<=1; dy++) {
                for(let dx=-1; dx<=1; dx++) {
                    const ny = (y + dy + size) % size;
                    const nx = (x + dx + size) % size;
                    sum += white[ny*size + nx];
                    n++;
                }
            }
            result[idx] = white[idx] - (sum / n);
        }
    }

    // Normalize to 0-255
    let min = Infinity, max = -Infinity;
    for(let i=0; i<count; i++) {
        if(result[i] < min) min = result[i];
        if(result[i] > max) max = result[i];
    }
    const range = max - min;
    for(let i=0; i<count; i++) {
        BLUE_NOISE[i] = Math.floor(((result[i] - min) / range) * 255);
    }
})();

self.onmessage = function(e) {
    const { idata, options } = e.data;
    const { width, height } = idata;
    const data = idata.data;
    const { contrast, brightness, saturation, ditherType1, ditherType2, ditherMix, ditherAmt, paletteId, axis1, axis2, axis3, useRedmean, customPaletteData } = options;

    const len = data.length;
    const bVal = brightness;
    const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    // Initial color adjustment
    for (let i = 0; i < len; i += 4) {
        let r = data[i], g = data[i+1], b = data[i+2];
        r = cFactor * (r - 128) + 128 + bVal;
        g = cFactor * (g - 128) + 128 + bVal;
        b = cFactor * (b - 128) + 128 + bVal;
        if (saturation !== 100) {
            const gray = CONSTANTS.LUMA_R * r + CONSTANTS.LUMA_G * g + CONSTANTS.LUMA_B * b;
            const sVal = saturation / 100;
            r = gray + (r - gray) * sVal;
            g = gray + (g - gray) * sVal;
            b = gray + (b - gray) * sVal;
        }
        data[i] = Math.max(0, Math.min(255, r));
        data[i+1] = Math.max(0, Math.min(255, g));
        data[i+2] = Math.max(0, Math.min(255, b));
    }

    let palette;
    let isMathMode = paletteId.startsWith('math_');
    if (!isMathMode) {
        if (customPaletteData) {
            palette = customPaletteData;
        } else if (paletteId.startsWith('auto')) {
            const count = parseInt(paletteId.replace('auto',''));
            if(count === 8) palette = PALETTES.cga1.concat(PALETTES.cga2);
            else if(count === 32) palette = PALETTES.vga.slice(0, 32);
            else palette = PALETTES.ega;
        } else { palette = PALETTES[paletteId] || PALETTES.vga; }
    }

    const dAmt = ditherAmt / 100, mix = ditherMix / 100;
    const spatialCache = new Map();
    const strategy1 = DitherStrategies[ditherType1] || DitherStrategies['none'];
    const strategy2 = DitherStrategies[ditherType2] || DitherStrategies['none'];
    const isBayer1 = ditherType1.startsWith('bayer');
    const isBayer2 = ditherType2.startsWith('bayer');

    // Helper to find closest color
    const findClosest = (r, g, b) => {
        const ri = Math.round(r), gi = Math.round(g), bi = Math.round(b);
        const key = (ri << 16) | (gi << 8) | bi;
        if (spatialCache.has(key)) return spatialCache.get(key);
        let minD = Infinity, best = palette[0], target = [r, g, b];
        for(let i = 0; i < palette.length; i++) {
            const d = useRedmean ? ColorUtils.distRedmean(target, palette[i]) : ColorUtils.distEuclidean(target, palette[i]);
            if(d < minD) { minD = d; best = palette[i]; if(d === 0) break; }
        }
        spatialCache.set(key, best);
        return best;
    };

    let lastReport = Date.now();

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            let r = data[idx], g = data[idx+1], b = data[idx+2];
            let offset = 0;
            if (isBayer1 || isBayer2 || ditherType1 === 'bluenoise' || ditherType2 === 'bluenoise') {
                let val1 = 0, val2 = 0;

                // Algo A
                if (isBayer1) {
                    const m = ditherType1 === 'bayer8' ? CONSTANTS.BAYER8 : CONSTANTS.BAYER4;
                    const dim = m.length;
                    val1 = ((m[y%dim][x%dim] / (dim*dim)) - 0.5) * 64;
                } else if (ditherType1 === 'bluenoise') {
                    val1 = ((BLUE_NOISE[(y%BLUE_NOISE_SIZE)*BLUE_NOISE_SIZE + (x%BLUE_NOISE_SIZE)] / 255) - 0.5) * 64;
                }

                // Algo B
                if (isBayer2) {
                    const m = ditherType2 === 'bayer8' ? CONSTANTS.BAYER8 : CONSTANTS.BAYER4;
                    const dim = m.length;
                    val2 = ((m[y%dim][x%dim] / (dim*dim)) - 0.5) * 64;
                } else if (ditherType2 === 'bluenoise') {
                    val2 = ((BLUE_NOISE[(y%BLUE_NOISE_SIZE)*BLUE_NOISE_SIZE + (x%BLUE_NOISE_SIZE)] / 255) - 0.5) * 64;
                }

                // Mix
                if (ditherType1 !== 'none' && ditherType2 === 'none') offset = val1;
                else if (ditherType1 === 'none' && ditherType2 !== 'none') offset = val2;
                else offset = val1 * (1-mix) + val2 * mix;
            }
            const dOffset = offset * dAmt;
            let dR = r + dOffset, dG = g + dOffset, dB = b + dOffset;
            let finalColor;

            if (isMathMode) {
                dR = Math.max(0, Math.min(255, dR)); dG = Math.max(0, Math.min(255, dG)); dB = Math.max(0, Math.min(255, dB));
                if (paletteId === 'math_dynamic_xy') {
                    const qs = axis1, quantBias = (axis2 / 256) * 100;
                    let rSteps = qs, gSteps = qs, bSteps = Math.max(2, qs / 2);
                    if (quantBias < 50) { rSteps = Math.max(2, Math.floor(qs * (quantBias/50))); bSteps = Math.max(2, qs - rSteps + 2); }
                    else { gSteps = Math.max(2, Math.floor(qs * ((100-quantBias)/50))); bSteps = Math.max(2, qs - gSteps + 2); }
                    finalColor = [ColorUtils.quantizeVal(dR, rSteps), ColorUtils.quantizeVal(dG, gSteps), ColorUtils.quantizeVal(dB, bSteps)];
                }
                else if (paletteId === 'math_rgb_split') finalColor = [ColorUtils.quantizeVal(dR, axis1), ColorUtils.quantizeVal(dG, axis2), ColorUtils.quantizeVal(dB, axis3)];
                else if (paletteId === 'math_luma_chroma') {
                    const yiq = ColorUtils.rgbToYiq(dR, dG, dB);
                    let qY = ColorUtils.quantizeVal(yiq[0], axis1);
                    const qSteps = axis2, stepSize = 300 / qSteps;
                    let qI = Math.round(yiq[1] / stepSize) * stepSize, qQ = Math.round(yiq[2] / stepSize) * stepSize;
                    finalColor = ColorUtils.yiqToRgb(qY, qI, qQ);
                }
                else if (paletteId === 'math_bitcrush') {
                        const bright = (dR+dG+dB)/3;
                        finalColor = bright < axis2 ? [0,0,0] : [ColorUtils.quantizeVal(dR, axis1), ColorUtils.quantizeVal(dG, axis1), ColorUtils.quantizeVal(dB, axis1)];
                }
                else if (paletteId === 'math_quant_rgb') finalColor = [ColorUtils.quantizeVal(dR, axis1), ColorUtils.quantizeVal(dG, axis1), ColorUtils.quantizeVal(dB, axis1)];
                else if (paletteId === 'math_quant_hsv') {
                    const hsv = ColorUtils.rgbToHsv(dR, dG, dB);
                    hsv[0] = Math.floor(hsv[0] * axis1) / axis1; hsv[1] = Math.floor(hsv[1] * axis1) / axis1; hsv[2] = Math.floor(hsv[2] * axis1) / axis1;
                    finalColor = ColorUtils.hsvToRgb(hsv[0], hsv[1], hsv[2]);
                }
            } else { finalColor = findClosest(dR, dG, dB); }

            data[idx] = finalColor[0]; data[idx+1] = finalColor[1]; data[idx+2] = finalColor[2];
            const er = (r - dOffset - finalColor[0]) * dAmt, eg = (g - dOffset - finalColor[1]) * dAmt, eb = (b - dOffset - finalColor[2]) * dAmt;
            if(!isBayer1) strategy1(data, idx, width, height, er, eg, eb, 1 - mix);
            if(!isBayer2) strategy2(data, idx, width, height, er, eg, eb, mix);
        }

        // Report progress every 10 rows or ~100ms
        if (y % 10 === 0 && Date.now() - lastReport > 50) {
             self.postMessage({ type: 'progress', value: y / height });
             lastReport = Date.now();
        }
    }

    self.postMessage({ type: 'complete', idata }, [idata.data.buffer]);
};
