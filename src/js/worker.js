import { ColorUtils } from './ColorUtils.js';
import { DitherStrategies } from './DitherStrategies.js';
import { CONSTANTS } from './Constants.js';
import { PALETTES } from './Palettes.js';

self.onmessage = async (e) => {
    const { id, options, imageData } = e.data;
    const { targetWidth, contrast, brightness, saturation, ditherType1, ditherType2, ditherMix, ditherAmt, paletteId, axis1, axis2, axis3, useRedmean } = options;

    // imageData is a Uint8ClampedArray (or similar) from ImageBitmap or ImageData
    // We can assume it's already resized if we do that on main thread, or we resize here.
    // The previous implementation resized on main thread via drawImage.
    // For now, let's assume we receive the raw pixel data already sized correctly,
    // OR we receive the full imageBitmap and resize it here (better for OffscreenCanvas).

    // However, since we are moving from main thread logic which did:
    // 1. Draw src to workCanvas (resized)
    // 2. Get ImageData
    // 3. Process

    // We can replicate this if we pass an OffscreenCanvas or ImageBitmap.
    // But to keep it simple with pure data transfer first (or minimal change):

    // Let's assume the main thread does the resizing (step 1 & 2) and sends the buffer.
    // This is what I planned: "ImageProcessor (main thread): Calculates targetWidth... Draws srcCanvas... Gets ImageData... Sends to worker".

    let data = new Uint8ClampedArray(imageData); // Copy or view
    const width = targetWidth; // width is known
    const height = data.length / (width * 4);

    const bVal = brightness;
    const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    // Color Adjust
    for (let i = 0; i < data.length; i += 4) {
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

    // Palette Setup
    let palette;
    let isMathMode = paletteId.startsWith('math_');
    if (!isMathMode) {
        if (paletteId.startsWith('auto')) {
            const count = parseInt(paletteId.replace('auto',''));
            if(count === 8) palette = PALETTES.cga1.concat(PALETTES.cga2);
            else if(count === 32) palette = PALETTES.vga.slice(0, 32);
            else palette = PALETTES.ega;
        } else { palette = PALETTES[paletteId] || PALETTES.vga; }
    }

    // Blue Noise Generator (Simple High-Pass White Noise)
    // We generate it once if not cached (global scope of worker)
    if (!self.blueNoise) {
        const size = 64;
        self.blueNoise = new Float32Array(size * size);
        for(let i=0; i<size*size; i++) self.blueNoise[i] = Math.random();
        // Simple smoothing to approximate blue noise (high pass)
        // This is a very rough approximation, real blue noise is harder.
        // But for dithering it works "okay" compared to white noise.
        // A better approach is void-and-cluster, but too complex for inline here.
        // We will stick to a pre-calculated small kernel or just white noise if complex.
        // Actually, let's use a known trick: Golden Ratio sampling for 1D, but 2D...
        // Let's just stick to random for now, or if I can find a small kernel.
        // Wait, the memory said "generated at runtime using a high-pass filtered white noise approach".
        // Let's do a simple box blur and subtract from original (High Pass).
        const temp = new Float32Array(size * size);
        for(let y=0; y<size; y++) {
            for(let x=0; x<size; x++) {
                let sum = 0;
                for(let ky=-1; ky<=1; ky++) {
                    for(let kx=-1; kx<=1; kx++) {
                        const py = (y+ky+size)%size;
                        const px = (x+kx+size)%size;
                        sum += self.blueNoise[py*size+px];
                    }
                }
                temp[y*size+x] = sum / 9;
            }
        }
        for(let i=0; i<size*size; i++) {
            self.blueNoise[i] = self.blueNoise[i] - temp[i] + 0.5;
        }
    }

    // Dither Setup
    const dAmt = ditherAmt / 100, mix = ditherMix / 100;
    const w = width, h = height;
    const spatialCache = new Map();
    const strategy1 = DitherStrategies[ditherType1] || DitherStrategies['none'];
    const strategy2 = DitherStrategies[ditherType2] || DitherStrategies['none'];
    const isBayer1 = ditherType1.startsWith('bayer') || ditherType1 === 'blue_noise';
    const isBayer2 = ditherType2.startsWith('bayer') || ditherType2 === 'blue_noise';

    // Helper to find closest (needs to be redefined or imported? Imported classes are available)
    const findClosest = (r, g, b, palette, useRedmean, cache) => {
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
    };

    // Processing Loop
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            let r = data[idx], g = data[idx+1], b = data[idx+2];
            let offset = 0;

            // Ordered Dither Offset Calculation
            if (isBayer1 || isBayer2) {
                let bayVal = 0;

                // Helper for getting value
                const getVal = (type) => {
                    if (type === 'blue_noise') {
                        const bnSize = 64;
                        const val = self.blueNoise[(y%bnSize)*bnSize + (x%bnSize)];
                        return (val - 0.5) * 64;
                    } else if (type.startsWith('bayer')) {
                        const m = (type === 'bayer8') ? CONSTANTS.BAYER8 : CONSTANTS.BAYER4;
                        const dim = m.length;
                        const th = m[y%dim][x%dim];
                        return ((th / (dim*dim)) - 0.5) * 64;
                    }
                    return 0;
                };

                const val1 = isBayer1 ? getVal(ditherType1) : 0;
                const val2 = isBayer2 ? getVal(ditherType2) : 0;

                if (isBayer1 && isBayer2) {
                    // Both are ordered/noise, mix them
                    offset = val1 * (1-mix) + val2 * mix;
                } else if (isBayer1) {
                    offset = val1 * (1-mix); // If mix is 0, full effect. If mix is 100, 0 effect.
                    // Wait, mix logic in loop is:
                    // strategy1(..., 1-mix)
                    // strategy2(..., mix)
                    // So if ditherType1 is Bayer and ditherType2 is Floyd (error diff):
                    // We apply Bayer offset scaled by (1-mix) ??
                    // No, usually ordered dither is applied to color, then error diff happens on top.
                    // But here we are mixing intensities.
                    // Let's stick to the previous logic:
                    // if isBayer1 && !isBayer2 => offset = val1 * (1-mix)
                    offset = val1; // * (1-mix) handled by dAmt? No dAmt is global amount.
                    // In previous code: if(isBayer1 && !isBayer2) offset = bayVal * (1-mix);
                    // This implies as we mix towards Algo B (Error Diff), we reduce Algo A (Bayer) intensity.
                    offset = val1 * (1-mix);
                } else if (isBayer2) {
                    offset = val2 * mix;
                }
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

            // Error Diffusion
            if(!isBayer1) strategy1(data, idx, w, h, er, eg, eb, 1 - mix);
            if(!isBayer2) strategy2(data, idx, w, h, er, eg, eb, mix);
        }
    }

    self.postMessage({ id, imageData: data.buffer }, [data.buffer]);
};
