import { CONSTANTS } from './Constants.js';

export class ColorUtils {
    static distEuclidean(c1, c2) { return (c1[0]-c2[0])**2 + (c1[1]-c2[1])**2 + (c1[2]-c2[2])**2; }

    static distRedmean(c1, c2) {
        let rMean = (c1[0] + c2[0]) / 2;
        let r = c1[0] - c2[0], g = c1[1] - c2[1], b = c1[2] - c2[2];
        return (((512+rMean)*r*r)>>8) + 4*g*g + (((767-rMean)*b*b)>>8);
    }

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

    static hsvToRgb(h, s, v) {
        let r, g, b, i = Math.floor(h*6), f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
        switch (i%6) {
            case 0: r=v,g=t,b=p; break; case 1: r=q,g=v,b=p; break; case 2: r=p,g=v,b=t; break;
            case 3: r=p,g=q,b=v; break; case 4: r=t,g=p,b=v; break; case 5: r=v,g=p,b=q; break;
        }
        return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
    }

    static rgbToYiq(r, g, b) {
        return [CONSTANTS.LUMA_R*r + CONSTANTS.LUMA_G*g + CONSTANTS.LUMA_B*b, 0.596*r - 0.274*g - 0.322*b, 0.211*r - 0.523*g - 0.312*b];
    }

    static yiqToRgb(y, i, q) {
        return [Math.max(0,Math.min(255, y+0.956*i+0.621*q)), Math.max(0,Math.min(255, y-0.272*i-0.647*q)), Math.max(0,Math.min(255, y-1.106*i+1.703*q))];
    }

    static quantizeVal(val, steps) {
        if (steps < 2) steps = 2;
        const stepSize = 255 / (steps - 1);
        return Math.floor(Math.round(val / stepSize) * stepSize);
    }
}
