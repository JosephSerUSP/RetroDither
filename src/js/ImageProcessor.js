import { CONSTANTS } from './constants.js';
import { PALETTES } from './palettes.js';
import { ColorUtils } from './ColorUtils.js';

/**
 * Handles image loading, processing, and pixel manipulation.
 */
export class ImageProcessor {
    /**
     * Creates an instance of ImageProcessor.
     */
    constructor() {
        this.srcCanvas = document.createElement('canvas');
        this.srcCtx = this.srcCanvas.getContext('2d');
        this.width = 0;
        this.height = 0;
        this.worker = null;
    }

    /**
     * Loads an image into the processor's source canvas.
     * @param {HTMLImageElement} img - The source image element.
     */
    loadImage(img) {
        this.width = img.width;
        this.height = img.height;
        this.srcCanvas.width = this.width;
        this.srcCanvas.height = this.height;
        this.srcCtx.drawImage(img, 0, 0);
    }

    /**
     * Processes the loaded image with the given options.
     * Uses a Web Worker to allow non-blocking processing.
     * @param {Object} options - Processing configuration (resolution, palette, dithering, etc.).
     * @param {function} onProgress - Callback for progress updates (0-1).
     * @param {function} onComplete - Callback with the final ImageData.
     */
    process(options, onProgress, onComplete) {
        const { targetWidth, paletteId } = options;
        const scale = targetWidth / this.width;
        const targetHeight = Math.floor(this.height * scale);

        const workCanvas = document.createElement('canvas');
        workCanvas.width = targetWidth;
        workCanvas.height = targetHeight;
        const ctx = workCanvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.srcCanvas, 0, 0, targetWidth, targetHeight);

        let idata = ctx.getImageData(0, 0, targetWidth, targetHeight);

        // Resolve Palette here in Main Thread to pass as data
        let customPaletteData = [];
        let isMathMode = paletteId.startsWith('math_');
        if (!isMathMode) {
            if (paletteId.startsWith('auto')) {
                const count = parseInt(paletteId.replace('auto',''));
                if(count === 8) customPaletteData = PALETTES.cga1.concat(PALETTES.cga2);
                else if(count === 32) customPaletteData = PALETTES.vga.slice(0, 32);
                else customPaletteData = PALETTES.ega;
            } else {
                customPaletteData = PALETTES[paletteId] || PALETTES.vga;
            }
        }

        // Initialize Worker if needed
        if (this.worker) this.worker.terminate();
        this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

        this.worker.onmessage = (e) => {
            if (e.data.type === 'progress') {
                onProgress(e.data.value);
            } else if (e.data.type === 'complete') {
                onComplete(e.data.imageData);
                this.worker.terminate();
                this.worker = null;
            }
        };

        this.worker.postMessage({
            imageData: idata,
            options: options,
            customPaletteData: customPaletteData
        });
    }
}
