import { CONSTANTS, PALETTES } from './constants.js';
import { ColorUtils } from './color-utils.js';
import { DitherStrategies, BLUE_NOISE, generateHilbertPath } from './dither.js';

const spatialCache = new Map();

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

self.onmessage = async (e) => {
    const { imageData, options, palette: customPalette } = e.data;
    const { width, height, data } = imageData;
    const { contrast, brightness, saturation, ditherType1, ditherType2, ditherMix, ditherAmt, paletteId, axis1, axis2, axis3, useRedmean } = options;

    const len = data.length;
    const bVal = brightness;
    const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    // Pre-process colors (Contrast, Brightness, Saturation)
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

    // Determine Palette
    let palette;
    let isMathMode = paletteId.startsWith('math_');
    if (!isMathMode) {
        if (customPalette) {
            palette = customPalette;
        } else if (paletteId.startsWith('auto')) {
            const count = parseInt(paletteId.replace('auto',''));
            if(count === 8) palette = PALETTES.cga1.concat(PALETTES.cga2);
            else if(count === 32) palette = PALETTES.vga.slice(0, 32);
            else palette = PALETTES.ega;
        } else {
             palette = PALETTES[paletteId] || PALETTES.vga;
        }
    }

    const dAmt = ditherAmt / 100, mix = ditherMix / 100, w = width, h = height;
    spatialCache.clear(); // Reset cache for new frame
    const strategy1 = DitherStrategies[ditherType1] || DitherStrategies['none'];
    const strategy2 = DitherStrategies[ditherType2] || DitherStrategies['none'];

    // Check for special dither modes
    const isRiemersma = ditherType1 === 'riemersma' || ditherType2 === 'riemersma';
    const isBlue1 = ditherType1 === 'bluenoise';
    const isBlue2 = ditherType2 === 'bluenoise';
    const isBayer1 = ditherType1.startsWith('bayer');
    const isBayer2 = ditherType2.startsWith('bayer');

    // Riemersma State
    let riemersmaQueue = [];
    const RIEMERSMA_HISTORY = 16; // Length of history
    // Weights: decay
    const riemersmaWeights = [];
    let weightSum = 0;
    for(let i=0; i<RIEMERSMA_HISTORY; i++) {
        const w = Math.exp(-i/8);
        riemersmaWeights.push(w);
        weightSum += w;
    }
    // Normalize
    for(let i=0; i<RIEMERSMA_HISTORY; i++) riemersmaWeights[i] /= weightSum;

    // Path Generation
    let points = null;
    if (isRiemersma) {
        points = generateHilbertPath(w, h);
    }

    // Processing Loop
    const pointCount = isRiemersma ? points.length : h * w;
    const updateProgressInterval = Math.floor(pointCount / 20); // 5% updates

    for (let i = 0; i < pointCount; i++) {
        let x, y;
        if (isRiemersma) {
            x = points[i].x; y = points[i].y;
        } else {
            y = Math.floor(i / w); x = i % w;
        }

        const idx = (y * w + x) * 4;
        let r = data[idx], g = data[idx+1], b = data[idx+2];
        let offset = 0;

        // Apply Ordered Dither (Bayer or Blue Noise)
        const applyOrdered = (type, isBayer, isBlue, factor) => {
            let val = 0;
            if (isBayer) {
                const m = (type === 'bayer8') ? CONSTANTS.BAYER8 : CONSTANTS.BAYER4;
                const dim = m.length;
                const th = m[y%dim][x%dim];
                val = ((th / (dim*dim)) - 0.5) * 64;
            } else if (isBlue) {
                const bn = BLUE_NOISE;
                const dim = bn.size;
                const th = bn.data[(y%dim)*dim + (x%dim)];
                val = ((th / 255) - 0.5) * 64; // Scale to similar range
            }
            return val * factor;
        };

        if ((isBayer1 || isBlue1) && (isBayer2 || isBlue2)) {
            offset = applyOrdered(ditherType1, isBayer1, isBlue1, 1-mix) + applyOrdered(ditherType2, isBayer2, isBlue2, mix);
        } else if (isBayer1 || isBlue1) {
             offset = applyOrdered(ditherType1, isBayer1, isBlue1, 1);
        } else if (isBayer2 || isBlue2) {
             offset = applyOrdered(ditherType2, isBayer2, isBlue2, 1); // If mix is involved?
             // Actually original logic:
             // if only 1 is bayer, use mix to interpolate? No, mix determines strategy strength.
             // If Strategy 1 is Bayer and 2 is None, mix=0.5 -> 50% bayer effect?
             // Original: offset = bayVal * (1-mix) if S1 is bayer and S2 is not.

             // Let's refine mixing logic.
             // Mix applies to the strength of Strategy 2 vs Strategy 1.
             // But for Ordered dither, it's pre-quantization offset.
             // For Error Diffusion, it's post-quantization distribution.

             // If S1=Bayer, S2=None, Mix=0.5. Result: 50% Bayer offset, 50% None (0 offset). Total 50% offset. Correct.

             let o1 = applyOrdered(ditherType1, isBayer1, isBlue1, 1);
             let o2 = applyOrdered(ditherType2, isBayer2, isBlue2, 1);

             // If strategy is NOT ordered, offset contribution is 0 for that part.
             if (!isBayer1 && !isBlue1) o1 = 0;
             if (!isBayer2 && !isBlue2) o2 = 0;

             offset = o1 * (1-mix) + o2 * mix;
        }

        // Apply Riemersma Error from History
        if (isRiemersma) {
            // Add error from history to current pixel
            let eR=0, eG=0, eB=0;
            // Iterate queue
            let maxW = 0;
            for(let k=0; k<riemersmaQueue.length; k++) {
                const w = riemersmaWeights[k];
                eR += riemersmaQueue[k][0] * w;
                eG += riemersmaQueue[k][1] * w;
                eB += riemersmaQueue[k][2] * w;
                maxW += w;
            }
            // Normalize? Riemersma usually just adds sum. But weights should likely sum to 1 or be calibrated.
            // With exp decay, previous pixel has weight 1.
            // Let's assume standard Riemersma: pixel += error_from_prev

            // Actually, Riemersma is:
            // Level = Pixel + Error
            // Out = Quant(Level)
            // Error = Level - Out
            // ... and Error is propagated. But Riemersma propagates to a list.
            // "The error is distributed to the next Z pixels along the curve"
            // Wait, that's pushing forward.
            // Equivalent to: Current pixel receives error from previous Z pixels.

            // If we push to queue (future), we need to read from it?
            // Simpler: Current pixel is modified by weighted sum of past errors.
            // New Error is pushed to FRONT of queue (or end, treating it as sliding window).

            if (riemersmaQueue.length > 0) {
                 r += eR * dAmt; // modulate by dither amount
                 g += eG * dAmt;
                 b += eB * dAmt;
            }
        }

        const dOffset = offset * dAmt;
        let dR = r + dOffset, dG = g + dOffset, dB = b + dOffset;
        let finalColor;

        // Color Quantization (Palette Matching)
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

        // Error Calculation
        // Note: Riemersma uses error from (r + history_error) - quant.
        // Standard ED uses error from (r + offset) - quant.
        // We unified them into dR, dG, dB.

        const er = (dR - finalColor[0]), eg = (dG - finalColor[1]), eb = (dB - finalColor[2]);

        // Riemersma Update
        if (isRiemersma) {
            // Push current error to history
            riemersmaQueue.unshift([er, eg, eb]);
            if (riemersmaQueue.length > RIEMERSMA_HISTORY) riemersmaQueue.pop();
        } else {
            // Standard Error Diffusion
            // If ditherType is standard ED (floyd, etc), distribute
            const eR_scaled = er * dAmt;
            const eG_scaled = eg * dAmt;
            const eB_scaled = eb * dAmt;

            if(!isBayer1 && !isBlue1 && strategy1 !== DitherStrategies['none']) strategy1(data, idx, w, h, eR_scaled, eG_scaled, eB_scaled, 1 - mix);
            if(!isBayer2 && !isBlue2 && strategy2 !== DitherStrategies['none']) strategy2(data, idx, w, h, eR_scaled, eG_scaled, eB_scaled, mix);
        }

        if (i % updateProgressInterval === 0) self.postMessage({ type: 'progress', progress: i / pointCount });
    }

    self.postMessage({ type: 'complete', data: imageData }, [imageData.data.buffer]);
};
