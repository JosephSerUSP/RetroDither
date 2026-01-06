import { ColorUtils } from './color_utils.js';
import { DitherStrategies } from './dither.js';
import { CONSTANTS } from './constants.js';

// No direct imports of PALETTES here, passed as message.
// But we might need ColorUtils and DitherStrategies.

// Generate Blue Noise Texture (lazy)
let blueNoiseTexture = null;
const getBlueNoise = () => {
    if (blueNoiseTexture) return blueNoiseTexture;
    // Approximate with white noise for now as per instructions, or generate pseudo-blue noise
    // A simple white noise texture is better than nothing if we can't load a real one.
    // However, to make it "Blue Noise"-like, we could try to generate it, but that's complex.
    // The memory says: "generated lazily at runtime within the Web Worker using a generated noise texture (currently approximated with white noise) of 64x64 size."
    const size = 64;
    blueNoiseTexture = new Float32Array(size * size);
    for(let i=0; i<blueNoiseTexture.length; i++) {
        blueNoiseTexture[i] = Math.random();
    }
    return blueNoiseTexture;
};

self.onmessage = function(e) {
    const { imageData, options, palette } = e.data;
    const {
        width, height,
        ditherType1, ditherType2, ditherMix, ditherAmt,
        paletteId, axis1, axis2, axis3, useRedmean
    } = options;

    const data = imageData.data;
    const spatialCache = new Map();
    const strategy1 = DitherStrategies[ditherType1] || DitherStrategies['none'];
    const strategy2 = DitherStrategies[ditherType2] || DitherStrategies['none'];
    const isBayer1 = ditherType1.startsWith('bayer');
    const isBayer2 = ditherType2.startsWith('bayer');
    const isBlueNoise1 = ditherType1 === 'bluenoise';
    const isBlueNoise2 = ditherType2 === 'bluenoise';

    const dAmt = ditherAmt / 100;
    const mix = ditherMix / 100;

    let noiseTex = null;
    if (isBlueNoise1 || isBlueNoise2) {
        noiseTex = getBlueNoise();
    }

    const isMathMode = paletteId.startsWith('math_');
    // Helper to find closest color
    const findClosest = (r, g, b, pal, redmean, cache) => {
        const ri = Math.round(r), gi = Math.round(g), bi = Math.round(b);
        const key = (ri << 16) | (gi << 8) | bi;
        if (cache.has(key)) return cache.get(key);
        let minD = Infinity, best = pal[0], target = [r, g, b];
        for(let i = 0; i < pal.length; i++) {
            const d = redmean ? ColorUtils.distRedmean(target, pal[i]) : ColorUtils.distEuclidean(target, pal[i]);
            if(d < minD) { minD = d; best = pal[i]; if(d === 0) break; }
        }
        cache.set(key, best);
        return best;
    };

    const w = width;
    const h = height;
    let lastReport = 0;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            let r = data[idx], g = data[idx+1], b = data[idx+2];
            let offset = 0;

            // Dither offset calculation
            const getDitherVal = (type, x, y) => {
                if (type.startsWith('bayer')) {
                    const m = type === 'bayer8' ? CONSTANTS.BAYER8 : CONSTANTS.BAYER4;
                    const dim = m.length;
                    const th = m[y%dim][x%dim];
                    return ((th / (dim*dim)) - 0.5) * 64;
                } else if (type === 'bluenoise') {
                    const tx = x % 64;
                    const ty = y % 64;
                    const val = noiseTex[ty * 64 + tx];
                    return (val - 0.5) * 64;
                }
                return 0;
            };

            const val1 = getDitherVal(ditherType1, x, y);
            const val2 = getDitherVal(ditherType2, x, y);

            // Mix logic:
            // If both are ordered/noise, we mix the offset.
            // If one is error diffusion, its offset is 0 here and applied later.

            if ((isBayer1 || isBlueNoise1) && (isBayer2 || isBlueNoise2)) {
                offset = val1 * (1-mix) + val2 * mix;
            } else if (isBayer1 || isBlueNoise1) {
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
            } else {
                finalColor = findClosest(dR, dG, dB, palette, useRedmean, spatialCache);
            }

            data[idx] = finalColor[0]; data[idx+1] = finalColor[1]; data[idx+2] = finalColor[2];
            const er = (r - dOffset - finalColor[0]) * dAmt, eg = (g - dOffset - finalColor[1]) * dAmt, eb = (b - dOffset - finalColor[2]) * dAmt;

            // Apply error diffusion
            if(!isBayer1 && !isBlueNoise1) strategy1(data, idx, w, h, er, eg, eb, 1 - mix);
            if(!isBayer2 && !isBlueNoise2) strategy2(data, idx, w, h, er, eg, eb, mix);
        }

        if (y % 10 === 0) {
            const now = Date.now();
            if (now - lastReport > 50) {
                self.postMessage({ type: 'progress', progress: y / h });
                lastReport = now;
            }
        }
    }

    self.postMessage({ type: 'done', imageData: imageData }, [imageData.data.buffer]);
};
