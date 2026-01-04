import { ColorUtils, CONSTANTS } from './color-utils.js';
import { PALETTES } from './palettes.js';
import { DitherStrategies } from './dither.js';

let blueNoiseTexture = null;

function generateBlueNoise() {
    // Approximate Blue Noise: High-pass filtered white noise
    const size = 64;
    const data = new Float32Array(size * size);

    // 1. White Noise
    for(let i=0; i<data.length; i++) data[i] = Math.random();

    // 2. Box Blur (Low Pass)
    const blur = new Float32Array(size * size);
    for(let y=0; y<size; y++) {
        for(let x=0; x<size; x++) {
            let sum = 0, count = 0;
            for(let dy=-1; dy<=1; dy++) {
                for(let dx=-1; dx<=1; dx++) {
                    let ny = (y+dy+size)%size;
                    let nx = (x+dx+size)%size;
                    sum += data[ny*size+nx];
                    count++;
                }
            }
            blur[y*size+x] = sum / count;
        }
    }

    // 3. Subtract (High Pass) & Normalize
    let min = Infinity, max = -Infinity;
    const result = new Float32Array(size * size);
    for(let i=0; i<data.length; i++) {
        let val = data[i] - blur[i];
        result[i] = val;
        if(val < min) min = val;
        if(val > max) max = val;
    }

    // Normalize to 0-1 then map to -32 to 32 (like Bayer)
    for(let i=0; i<result.length; i++) {
        result[i] = ((result[i] - min) / (max - min));
    }
    return result;
}

self.onmessage = function(e) {
    if (!blueNoiseTexture) blueNoiseTexture = generateBlueNoise();

    const { imageData, width, height, options } = e.data;
    const data = new Uint8ClampedArray(imageData);

    // Process the data
    processImage(data, width, height, options);

    // Send back result
    self.postMessage({ imageData: data.buffer }, [data.buffer]);
};

function processImage(data, width, height, options) {
    const { contrast, brightness, saturation, ditherType1, ditherType2, ditherMix, ditherAmt, paletteId, axis1, axis2, axis3, useRedmean } = options;
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

    // 2. Palette Setup
    let palette = options.palette;
    let isMathMode = paletteId.startsWith('math_');
    if (!isMathMode && !palette) {
        if (paletteId.startsWith('auto')) {
            const count = parseInt(paletteId.replace('auto',''));
            if(count === 8) palette = PALETTES.cga1.concat(PALETTES.cga2);
            else if(count === 32) palette = PALETTES.vga.slice(0, 32);
            else palette = PALETTES.ega;
        } else { palette = PALETTES[paletteId] || PALETTES.vga; }
    }

    // 3. Dithering Loop
    const dAmt = ditherAmt / 100, mix = ditherMix / 100;
    const spatialCache = new Map();
    const strategy1 = DitherStrategies[ditherType1] || DitherStrategies['none'];
    const strategy2 = DitherStrategies[ditherType2] || DitherStrategies['none'];
    const isBayer1 = ditherType1.startsWith('bayer');
    const isBayer2 = ditherType2.startsWith('bayer');
    const isBlue1 = ditherType1 === 'bluenoise';
    const isBlue2 = ditherType2 === 'bluenoise';

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            let r = data[idx], g = data[idx+1], b = data[idx+2];

            // Ordered Dither Offset (Bayer or Blue Noise)
            let offset = 0;

            // Helper to get offset for a specific type
            const getOffset = (type, isBayer, isBlue) => {
                if (isBayer) {
                    const m = (type === 'bayer8') ? CONSTANTS.BAYER8 : CONSTANTS.BAYER4;
                    const dim = m.length;
                    const th = m[y%dim][x%dim];
                    return ((th / (dim*dim)) - 0.5) * 64;
                } else if (isBlue) {
                    const size = 64;
                    return (blueNoiseTexture[(y%size)*size + (x%size)] - 0.5) * 64;
                }
                return 0;
            };

            const off1 = getOffset(ditherType1, isBayer1, isBlue1);
            const off2 = getOffset(ditherType2, isBayer2, isBlue2);

            // Mix offsets if both are ordered-ish
            if ((isBayer1 || isBlue1) && (isBayer2 || isBlue2)) {
                 offset = off1 * (1-mix) + off2 * mix;
            } else if (isBayer1 || isBlue1) {
                 offset = off1; // mix handled by strategy blending later? No, strategy blending is for error diffusion.
                 // If algo1 is ordered and algo2 is error diffusion, we apply ordered offset fully?
                 // The original logic was: "if isBayer1 and !isBayer2, offset = bayVal * (1-mix)".
                 // Let's replicate that logic.
                 if (!(isBayer2 || isBlue2)) offset = off1 * (1-mix);
                 else offset = off1; // Handled above
            } else if (isBayer2 || isBlue2) {
                 offset = off2 * mix;
            }

            const dOffset = offset * dAmt;

            let dR = r + dOffset, dG = g + dOffset, dB = b + dOffset;
            let finalColor;

            // Quantization / Palette Mapping
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

            // Set Pixel
            data[idx] = finalColor[0]; data[idx+1] = finalColor[1]; data[idx+2] = finalColor[2];

            // Error Diffusion
            const er = (r - dOffset - finalColor[0]) * dAmt, eg = (g - dOffset - finalColor[1]) * dAmt, eb = (b - dOffset - finalColor[2]) * dAmt;
            if(!(isBayer1 || isBlue1)) strategy1(data, idx, width, height, er, eg, eb, 1 - mix);
            if(!(isBayer2 || isBlue2)) strategy2(data, idx, width, height, er, eg, eb, mix);
        }
    }
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
