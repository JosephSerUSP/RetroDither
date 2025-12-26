import { CONSTANTS } from './constants.js';

/**
 * Utility class for color calculations and conversions.
 */
export class ColorUtils {
    /**
     * Calculates the squared Euclidean distance between two colors.
     * @param {number[]} c1 - First color [r, g, b].
     * @param {number[]} c2 - Second color [r, g, b].
     * @returns {number} The squared distance.
     */
    static distEuclidean(c1, c2) { return (c1[0]-c2[0])**2 + (c1[1]-c2[1])**2 + (c1[2]-c2[2])**2; }

    /**
     * Calculates the Redmean color distance between two colors.
     * This approximates human color perception better than Euclidean distance.
     * @param {number[]} c1 - First color [r, g, b].
     * @param {number[]} c2 - Second color [r, g, b].
     * @returns {number} The weighted squared distance.
     */
    static distRedmean(c1, c2) {
        let rMean = (c1[0] + c2[0]) / 2;
        let r = c1[0] - c2[0], g = c1[1] - c2[1], b = c1[2] - c2[2];
        return (((512+rMean)*r*r)>>8) + 4*g*g + (((767-rMean)*b*b)>>8);
    }

    /**
     * Converts RGB color space to HSV.
     * @param {number} r - Red (0-255).
     * @param {number} g - Green (0-255).
     * @param {number} b - Blue (0-255).
     * @returns {number[]} The HSV representation [h, s, v] where h, s, v are 0-1.
     */
    static rgbToHsv(r, g, b) {
        r/=255, g/=255, b/=255;
        let max = Math.max(r,g,b), min = Math.min(r,g,b);
        let h, s, v = max, d = max - min;
        s = max == 0 ? 0 : d / max;
        if (max == min) h = 0;
        else {
            switch (max) {
                case r: h = (g-b)/d+(g<b?6:0); break;
                case g: h = (b-r)/d+2; break;
                case b: h = (r-g)/d+4; break;
            }
            h /= 6;
        }
        return [h, s, v];
    }

    /**
     * Converts HSV color space to RGB.
     * @param {number} h - Hue (0-1).
     * @param {number} s - Saturation (0-1).
     * @param {number} v - Value (0-1).
     * @returns {number[]} The RGB representation [r, g, b] (0-255).
     */
    static hsvToRgb(h, s, v) {
        let r, g, b, i = Math.floor(h*6), f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
        switch (i%6) {
            case 0: r=v,g=t,b=p; break; case 1: r=q,g=v,b=p; break; case 2: r=p,g=v,b=t; break;
            case 3: r=p,g=q,b=v; break; case 4: r=t,g=p,b=v; break; case 5: r=v,g=p,b=q; break;
        }
        return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
    }

    /**
     * Converts RGB color space to YIQ.
     * @param {number} r - Red (0-255).
     * @param {number} g - Green (0-255).
     * @param {number} b - Blue (0-255).
     * @returns {number[]} The YIQ representation [y, i, q].
     */
    static rgbToYiq(r, g, b) {
        return [CONSTANTS.LUMA_R*r + CONSTANTS.LUMA_G*g + CONSTANTS.LUMA_B*b, 0.596*r - 0.274*g - 0.322*b, 0.211*r - 0.523*g - 0.312*b];
    }

    /**
     * Converts YIQ color space to RGB.
     * @param {number} y - Luma component.
     * @param {number} i - In-phase component.
     * @param {number} q - Quadrature component.
     * @returns {number[]} The RGB representation [r, g, b] (0-255).
     */
    static yiqToRgb(y, i, q) {
        return [Math.max(0,Math.min(255, y+0.956*i+0.621*q)), Math.max(0,Math.min(255, y-0.272*i-0.647*q)), Math.max(0,Math.min(255, y-1.106*i+1.703*q))];
    }

    /**
     * Quantizes a value into a specific number of steps.
     * @param {number} val - The value to quantize (0-255).
     * @param {number} steps - The number of steps/levels.
     * @returns {number} The quantized value.
     */
    static quantizeVal(val, steps) {
        if (steps < 2) steps = 2;
        const stepSize = 255 / (steps - 1);
        return Math.floor(Math.round(val / stepSize) * stepSize);
    }
}
