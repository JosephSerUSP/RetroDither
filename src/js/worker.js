import { CONSTANTS, ColorUtils } from './utils.js';
import { PALETTES } from './palettes.js';
import { DitherStrategies, generateBlueNoise } from './dither.js';

// Lazy load blue noise
let blueNoiseMatrix = null;

self.onmessage = function(e) {
    const { id, imageData, options, customPaletteData } = e.data;
    const { contrast, brightness, saturation, ditherType1, ditherType2, ditherMix, ditherAmt, paletteId, axis1, axis2, axis3, useRedmean } = options;

    // Check if blue noise is needed
    if ((ditherType1 === 'bluenoise' || ditherType2 === 'bluenoise') && !blueNoiseMatrix) {
        blueNoiseMatrix = generateBlueNoise(64, 64);
    }

    const data = imageData.data;
    const len = data.length;
    const w = imageData.width;
    const h = imageData.height;

    const bVal = brightness;
    const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    // Pre-processing: Color Adjust
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
    const isOrdered1 = ditherType1.startsWith('bayer') || ditherType1 === 'bluenoise';
    const isOrdered2 = ditherType2.startsWith('bayer') || ditherType2 === 'bluenoise';

    const findClosest = (r, g, b, pal, useRm, cache) => {
        const ri = Math.round(r), gi = Math.round(g), bi = Math.round(b);
        const key = (ri << 16) | (gi << 8) | bi;
        if (cache.has(key)) return cache.get(key);
        let minD = Infinity, best = pal[0], target = [r, g, b];
        for(let i = 0; i < pal.length; i++) {
            const d = useRm ? ColorUtils.distRedmean(target, pal[i]) : ColorUtils.distEuclidean(target, pal[i]);
            if(d < minD) { minD = d; best = pal[i]; if(d === 0) break; }
        }
        cache.set(key, best);
        return best;
    };

    const getOrderedOffset = (type, x, y) => {
        let m;
        if (type === 'bluenoise') m = blueNoiseMatrix;
        else if (type === 'bayer8') m = CONSTANTS.BAYER8;
        else m = CONSTANTS.BAYER4; // bayer4 and bayer2 map here for now

        if (!m) return 0;
        const dim = m.length; // 64 for blue noise, 8 or 4 for bayer
        const th = m[y%dim][x%dim];

        // For Bayer8: th is 0..63. dim*dim is 64. th/(dim*dim) is 0..1. Result is -32..32.
        // For BlueNoise: th is 0..4095. dim*dim is 4096. th/(dim*dim) is 0..1. Result is -32..32.
        return ((th / (dim*dim)) - 0.5) * 64;
    };

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            let r = data[idx], g = data[idx+1], b = data[idx+2];

            let offset = 0;
            if (isOrdered1 || isOrdered2) {
                let off1 = 0, off2 = 0;
                if (isOrdered1) off1 = getOrderedOffset(ditherType1, x, y);
                if (isOrdered2) off2 = getOrderedOffset(ditherType2, x, y);

                if (isOrdered1 && !isOrdered2) offset = off1 * (1 - mix); // Only 1 is ordered, applied weighted
                else if (!isOrdered1 && isOrdered2) offset = off2 * mix; // Only 2 is ordered
                else offset = off1 * (1 - mix) + off2 * mix; // Both ordered
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

            // Only apply error diffusion if the strategy is NOT ordered (because we handle ordered offset above)
            if(!isOrdered1) strategy1(data, idx, w, h, er, eg, eb, 1 - mix);
            if(!isOrdered2) strategy2(data, idx, w, h, er, eg, eb, mix);
        }
        if (y % 20 === 0) self.postMessage({ id, type: 'progress', progress: y / h });
    }

    self.postMessage({ id, type: 'complete', imageData }, [imageData.data.buffer]);
};
