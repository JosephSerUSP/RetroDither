import { CONSTANTS } from './constants.js';
import { ColorUtils } from './ColorUtils.js';
import { DitherStrategies } from './DitherStrategies.js';

let blueNoiseTexture = null;

function generateBlueNoise(size) {
    const count = size * size;
    let data = new Float32Array(count);
    for(let i=0; i<count; i++) data[i] = Math.random();

    // Simple high-pass filter: Original - Blurred
    // Blur
    const blurred = new Float32Array(count);
    const kernel = [ // 3x3 Gaussian approx
        1/16, 2/16, 1/16,
        2/16, 4/16, 2/16,
        1/16, 2/16, 1/16
    ];
    for(let y=0; y<size; y++) {
        for(let x=0; x<size; x++) {
            let sum = 0;
            for(let ky=-1; ky<=1; ky++) {
                for(let kx=-1; kx<=1; kx++) {
                    let py = (y + ky + size) % size;
                    let px = (x + kx + size) % size;
                    sum += data[py*size + px] * kernel[(ky+1)*3 + (kx+1)];
                }
            }
            blurred[y*size+x] = sum;
        }
    }

    // High pass
    for(let i=0; i<count; i++) data[i] -= blurred[i];

    // Histogram Equalization (Rank) to ensure uniform distribution
    const indices = Array.from({length: count}, (_, i) => i);
    indices.sort((a, b) => data[a] - data[b]);

    const ranked = new Float32Array(count);
    for(let i=0; i<count; i++) {
        ranked[indices[i]] = i / count;
    }

    return ranked;
}

if (!blueNoiseTexture) {
    blueNoiseTexture = generateBlueNoise(64);
}

function findClosest(r, g, b, palette, useRedmean, cache) {
    const ri = Math.round(r), gi = Math.round(g), bi = Math.round(b);
    const key = (ri << 16) | (gi << 8) | bi;
    if (cache.has(key)) return cache.get(key);
    let minD = Infinity, best = palette[0], target = [r, g, b];
    for(let i = 0; i < palette.length; i++) {
        const d = useRedmean ? ColorUtils.distRedmean(target, palette[i]) : ColorUtils.distEuclidean(target, palette[i]);
        if(d < minD) { minD = d; best = palette[i]; if(d === 0) break; }
    }
    cache.set(key, best);
    return best;
}

self.onmessage = function(e) {
    const { imageData, options, customPaletteData } = e.data;
    const { targetWidth, contrast, brightness, saturation, ditherType1, ditherType2, ditherMix, ditherAmt, paletteId, axis1, axis2, axis3, useRedmean } = options;

    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const len = data.length;

    // 1. Color Adjustment
    const bVal = brightness;
    const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < len; i += 4) {
        let r = data[i], g = data[i+1], b = data[i+2];

        // Contrast & Brightness
        r = cFactor * (r - 128) + 128 + bVal;
        g = cFactor * (g - 128) + 128 + bVal;
        b = cFactor * (b - 128) + 128 + bVal;

        // Saturation
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

    // 2. Prepare Palette
    let palette = customPaletteData;
    const isMathMode = paletteId.startsWith('math_');

    // 3. Dithering
    const dAmt = ditherAmt / 100;
    const mix = ditherMix / 100;
    const spatialCache = new Map();

    const strategy1 = DitherStrategies[ditherType1] || DitherStrategies['none'];
    const strategy2 = DitherStrategies[ditherType2] || DitherStrategies['none'];

    const isOrdered1 = ditherType1.startsWith('bayer') || ditherType1 === 'bluenoise';
    const isOrdered2 = ditherType2.startsWith('bayer') || ditherType2 === 'bluenoise';

    const getOrderedValue = (type, x, y) => {
        if (type === 'bluenoise') {
            const size = 64;
            return (blueNoiseTexture[(y % size) * size + (x % size)] - 0.5) * 64;
        } else if (type.startsWith('bayer')) {
            const m = (type === 'bayer8') ? CONSTANTS.BAYER8 : CONSTANTS.BAYER4;
            const dim = m.length;
            const th = m[y % dim][x % dim];
            return ((th / (dim * dim)) - 0.5) * 64;
        }
        return 0;
    };

    // Report progress periodically
    const reportInterval = Math.floor(height / 20); // 20 updates

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            let r = data[idx], g = data[idx+1], b = data[idx+2];

            let offset = 0;
            if (isOrdered1 || isOrdered2) {
                let v1 = 0, v2 = 0;
                if (isOrdered1) v1 = getOrderedValue(ditherType1, x, y);
                if (isOrdered2) v2 = getOrderedValue(ditherType2, x, y);

                if (isOrdered1 && !isOrdered2) offset = v1 * (1 - mix);
                else if (!isOrdered1 && isOrdered2) offset = v2 * mix;
                else if (isOrdered1 && isOrdered2) offset = v1 * (1 - mix) + v2 * mix;
            }

            const dOffset = offset * dAmt;
            let dR = r + dOffset;
            let dG = g + dOffset;
            let dB = b + dOffset;
            let finalColor;

            if (isMathMode) {
                dR = Math.max(0, Math.min(255, dR));
                dG = Math.max(0, Math.min(255, dG));
                dB = Math.max(0, Math.min(255, dB));

                if (paletteId === 'math_dynamic_xy') {
                    const qs = axis1, quantBias = (axis2 / 256) * 100;
                    let rSteps = qs, gSteps = qs, bSteps = Math.max(2, qs / 2);
                    if (quantBias < 50) { rSteps = Math.max(2, Math.floor(qs * (quantBias/50))); bSteps = Math.max(2, qs - rSteps + 2); }
                    else { gSteps = Math.max(2, Math.floor(qs * ((100-quantBias)/50))); bSteps = Math.max(2, qs - gSteps + 2); }
                    finalColor = [ColorUtils.quantizeVal(dR, rSteps), ColorUtils.quantizeVal(dG, gSteps), ColorUtils.quantizeVal(dB, bSteps)];
                }
                else if (paletteId === 'math_rgb_split') {
                    finalColor = [ColorUtils.quantizeVal(dR, axis1), ColorUtils.quantizeVal(dG, axis2), ColorUtils.quantizeVal(dB, axis3)];
                }
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
                else if (paletteId === 'math_quant_rgb') {
                    finalColor = [ColorUtils.quantizeVal(dR, axis1), ColorUtils.quantizeVal(dG, axis1), ColorUtils.quantizeVal(dB, axis1)];
                }
                else if (paletteId === 'math_quant_hsv') {
                    const hsv = ColorUtils.rgbToHsv(dR, dG, dB);
                    hsv[0] = Math.floor(hsv[0] * axis1) / axis1; hsv[1] = Math.floor(hsv[1] * axis1) / axis1; hsv[2] = Math.floor(hsv[2] * axis1) / axis1;
                    finalColor = ColorUtils.hsvToRgb(hsv[0], hsv[1], hsv[2]);
                }
            } else {
                // Palette Mode
                finalColor = findClosest(dR, dG, dB, palette, useRedmean, spatialCache);
            }

            // Write final color
            data[idx] = finalColor[0];
            data[idx+1] = finalColor[1];
            data[idx+2] = finalColor[2];

            // Error Diffusion
            const er = (r - dOffset - finalColor[0]) * dAmt;
            const eg = (g - dOffset - finalColor[1]) * dAmt;
            const eb = (b - dOffset - finalColor[2]) * dAmt;

            if(!isOrdered1) strategy1(data, idx, width, height, er, eg, eb, 1 - mix);
            if(!isOrdered2) strategy2(data, idx, width, height, er, eg, eb, mix);
        }

        if (y % reportInterval === 0) {
            self.postMessage({ type: 'progress', value: y / height });
        }
    }

    self.postMessage({ type: 'complete', imageData: imageData });
};
