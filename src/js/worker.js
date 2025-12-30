import { ColorUtils } from './ColorUtils.js';
import { DitherStrategies } from './DitherStrategies.js';
import { CONSTANTS } from './Constants.js';
import { PALETTES } from './Palettes.js';

let blueNoiseTexture = null;

self.onmessage = async function(e) {
    const {
        id,
        imageData,
        width,
        height,
        options
    } = e.data;

    // Generate Blue Noise texture once
    if (!blueNoiseTexture && (options.ditherType1 === 'bluenoise' || options.ditherType2 === 'bluenoise')) {
        blueNoiseTexture = DitherStrategies.generateBlueNoise();
    }

    try {
        const result = await processImage(imageData, width, height, options);
        self.postMessage({ id, imageData: result, success: true }, [result.data.buffer]);
    } catch (error) {
        self.postMessage({ id, error: error.message, success: false });
    }
};

async function processImage(idata, w, h, options) {
    const { contrast, brightness, saturation, ditherType1, ditherType2, ditherMix, ditherAmt, paletteId, axis1, axis2, axis3, useRedmean } = options;
    const data = idata.data;
    const len = data.length;

    // Pre-calculate contrast factor
    const bVal = brightness;
    const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    // Color Adjustments
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

    // Palette Setup
    let palette;
    let isMathMode = paletteId.startsWith('math_');
    if (!isMathMode) {
        if (paletteId.startsWith('auto')) {
            const count = parseInt(paletteId.replace('auto',''));
            if(count === 8) palette = PALETTES.cga1.concat(PALETTES.cga2);
            else if(count === 32) palette = PALETTES.vga.slice(0, 32);
            else palette = PALETTES.ega;
        } else if (paletteId.startsWith('custom_')) {
            palette = PALETTES[paletteId] || PALETTES.vga;
        } else {
            palette = PALETTES[paletteId] || PALETTES.vga;
        }
    }

    // Dithering Setup
    const dAmt = ditherAmt / 100, mix = ditherMix / 100;
    const spatialCache = new Map();
    const strategy1 = DitherStrategies[ditherType1] || DitherStrategies['none'];
    const strategy2 = DitherStrategies[ditherType2] || DitherStrategies['none'];
    const isBayer1 = ditherType1.startsWith('bayer');
    const isBayer2 = ditherType2.startsWith('bayer');
    const isBlue1 = ditherType1 === 'bluenoise';
    const isBlue2 = ditherType2 === 'bluenoise';

    // Processing Loop
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            let r = data[idx], g = data[idx+1], b = data[idx+2];
            let offset = 0;

            // Ordered Dithering (Bayer or Blue Noise)
            if (isBayer1 || isBayer2 || isBlue1 || isBlue2) {
                let val1 = 0;
                let val2 = 0;

                // Calculate Value 1
                if (isBayer1) {
                    const m = (ditherType1 === 'bayer8') ? CONSTANTS.BAYER8 : CONSTANTS.BAYER4;
                    const dim = m.length;
                    val1 = ((m[y%dim][x%dim] / (dim*dim)) - 0.5) * 64;
                } else if (isBlue1 && blueNoiseTexture) {
                    val1 = (blueNoiseTexture[(y%64)*64 + (x%64)] - 0.5) * 64;
                }

                // Calculate Value 2
                if (isBayer2) {
                    const m = (ditherType2 === 'bayer8') ? CONSTANTS.BAYER8 : CONSTANTS.BAYER4;
                    const dim = m.length;
                    val2 = ((m[y%dim][x%dim] / (dim*dim)) - 0.5) * 64;
                } else if (isBlue2 && blueNoiseTexture) {
                    val2 = (blueNoiseTexture[(y%64)*64 + (x%64)] - 0.5) * 64;
                }

                // Mix
                if ((isBayer1 || isBlue1) && !(isBayer2 || isBlue2)) {
                    offset = val1;
                } else if (!(isBayer1 || isBlue1) && (isBayer2 || isBlue2)) {
                    offset = val2;
                } else {
                    offset = val1 * (1 - mix) + val2 * mix;
                }
            }

            const dOffset = offset * dAmt;
            let dR = r + dOffset, dG = g + dOffset, dB = b + dOffset;
            let finalColor;

            if (isMathMode) {
                dR = Math.max(0, Math.min(255, dR));
                dG = Math.max(0, Math.min(255, dG));
                dB = Math.max(0, Math.min(255, dB));

                if (paletteId === 'math_dynamic_xy') {
                    const qs = axis1, quantBias = (axis2 / 256) * 100;
                    let rSteps = qs, gSteps = qs, bSteps = Math.max(2, qs / 2);
                    if (quantBias < 50) {
                        rSteps = Math.max(2, Math.floor(qs * (quantBias/50)));
                        bSteps = Math.max(2, qs - rSteps + 2);
                    } else {
                        gSteps = Math.max(2, Math.floor(qs * ((100-quantBias)/50)));
                        bSteps = Math.max(2, qs - gSteps + 2);
                    }
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
                    hsv[0] = Math.floor(hsv[0] * axis1) / axis1;
                    hsv[1] = Math.floor(hsv[1] * axis1) / axis1;
                    hsv[2] = Math.floor(hsv[2] * axis1) / axis1;
                    finalColor = ColorUtils.hsvToRgb(hsv[0], hsv[1], hsv[2]);
                }
            } else {
                finalColor = findClosest(dR, dG, dB, palette, useRedmean, spatialCache);
            }

            data[idx] = finalColor[0];
            data[idx+1] = finalColor[1];
            data[idx+2] = finalColor[2];

            // Error Diffusion
            const er = (r - dOffset - finalColor[0]) * dAmt;
            const eg = (g - dOffset - finalColor[1]) * dAmt;
            const eb = (b - dOffset - finalColor[2]) * dAmt;

            if(!isBayer1 && !isBlue1) strategy1(data, idx, w, h, er, eg, eb, 1 - mix);
            if(!isBayer2 && !isBlue2) strategy2(data, idx, w, h, er, eg, eb, mix);
        }

        // Report progress every 10%
        if (y % Math.floor(h/10) === 0) {
            self.postMessage({ id, type: 'progress', value: y / h });
        }
    }

    return idata;
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
