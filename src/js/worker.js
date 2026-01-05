import { CONSTANTS } from './constants.js';
import { ColorUtils } from './utils.js';
import { DitherStrategies } from './dither.js';

let blueNoiseTexture = null;

// Generate a pseudo-blue noise texture on initialization
// This is a simple void-and-cluster-like approximation or just white noise for now
function generateBlueNoise(size = 64) {
    const data = new Float32Array(size * size);
    for(let i=0; i<data.length; i++) data[i] = Math.random();
    // A real implementation would optimize this distribution
    return data;
}
blueNoiseTexture = generateBlueNoise(64);

self.onmessage = (e) => {
    const { id, imageData, options } = e.data;
    if (!imageData) return;

    try {
        const { width, height, data } = imageData;
        const processedData = process(data, width, height, options);
        self.postMessage({ id, success: true, data: processedData, width, height }, [processedData.buffer]);
    } catch (err) {
        console.error(err);
        self.postMessage({ id, success: false, error: err.message });
    }
};

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

function process(data, width, height, options) {
    const { contrast, brightness, saturation, ditherType1, ditherType2, ditherMix, ditherAmt, paletteId, palette, axis1, axis2, axis3, useRedmean } = options;

    const len = data.length;
    const bVal = brightness;
    const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    // Color Adjust
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

    const isMathMode = paletteId.startsWith('math_');
    const dAmt = ditherAmt / 100, mix = ditherMix / 100;
    const spatialCache = new Map();
    const strategy1 = DitherStrategies[ditherType1] || DitherStrategies['none'];
    const strategy2 = DitherStrategies[ditherType2] || DitherStrategies['none'];
    const isBayer1 = ditherType1.startsWith('bayer');
    const isBayer2 = ditherType2.startsWith('bayer');
    const isBlueNoise1 = ditherType1 === 'bluenoise';
    const isBlueNoise2 = ditherType2 === 'bluenoise';

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            let r = data[idx], g = data[idx+1], b = data[idx+2];

            // Calculate Dither Offset
            let offset = 0;
            let val1 = 0, val2 = 0;

            if (isBayer1) {
                const m = (ditherType1 === 'bayer8') ? CONSTANTS.BAYER8 : CONSTANTS.BAYER4;
                const dim = m.length;
                val1 = ((m[y%dim][x%dim] / (dim*dim)) - 0.5) * 64;
            } else if (isBlueNoise1) {
                val1 = (blueNoiseTexture[(y%64)*64 + (x%64)] - 0.5) * 64;
            }

            if (isBayer2) {
                const m = (ditherType2 === 'bayer8') ? CONSTANTS.BAYER8 : CONSTANTS.BAYER4;
                const dim = m.length;
                val2 = ((m[y%dim][x%dim] / (dim*dim)) - 0.5) * 64;
            } else if (isBlueNoise2) {
                val2 = (blueNoiseTexture[(y%64)*64 + (x%64)] - 0.5) * 64;
            }

            // Mixing logic for Ordered/BlueNoise
            // If both are ordered-type (Bayer or BlueNoise), we mix their offsets
            // If one is error diffusion, the offset logic only applies to the ordered one
            if ((isBayer1 || isBlueNoise1) && (isBayer2 || isBlueNoise2)) {
                 offset = val1 * (1-mix) + val2 * mix;
            } else if (isBayer1 || isBlueNoise1) {
                 offset = val1;
                 // If mixing with Error Diff, usually we just apply the ordered one fully
                 // and let the error diffusion handle the rest?
                 // Or we reduce the ordered intensity? Let's reduce intensity by mix
                 // Wait, existing logic: if(isBayer1 && !isBayer2) offset = bayVal * (1-mix);
                 offset = val1 * (1-mix);
            } else if (isBayer2 || isBlueNoise2) {
                 offset = val2 * mix;
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
            } else { finalColor = findClosest(dR, dG, dB, palette, useRedmean, spatialCache); }

            data[idx] = finalColor[0]; data[idx+1] = finalColor[1]; data[idx+2] = finalColor[2];
            const er = (r - dOffset - finalColor[0]) * dAmt, eg = (g - dOffset - finalColor[1]) * dAmt, eb = (b - dOffset - finalColor[2]) * dAmt;

            // Apply error diffusion if selected
            if(!isBayer1 && !isBlueNoise1) strategy1(data, idx, width, height, er, eg, eb, 1 - mix);
            if(!isBayer2 && !isBlueNoise2) strategy2(data, idx, width, height, er, eg, eb, mix);
        }
    }
    return data;
}
