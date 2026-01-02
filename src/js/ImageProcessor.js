/**
 * Handles image loading, processing, and pixel manipulation using a Web Worker.
 */
import { PALETTES } from './palettes.js';

export class ImageProcessor {
    /**
     * Creates an instance of ImageProcessor.
     */
    constructor() {
        this.srcCanvas = document.createElement('canvas');
        this.srcCtx = this.srcCanvas.getContext('2d');
        this.width = 0;
        this.height = 0;
        this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        this.callbacks = new Map();

        this.worker.onmessage = (e) => {
            const { id, type, progress, imageData } = e.data;
            if (!this.callbacks.has(id)) return;

            const { onProgress, onComplete } = this.callbacks.get(id);

            if (type === 'progress') {
                if (onProgress) onProgress(progress);
            } else if (type === 'complete') {
                if (onComplete) onComplete(imageData);
                this.callbacks.delete(id);
            }
        };
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
     * Sends work to the Web Worker.
     * @param {Object} options - Processing configuration (resolution, palette, dithering, etc.).
     * @param {function} onProgress - Callback for progress updates (0-1).
     * @param {function} onComplete - Callback with the final ImageData.
     */
    process(options, onProgress, onComplete) {
        const { targetWidth, paletteId } = options;
        const scale = targetWidth / this.width;
        const targetHeight = Math.floor(this.height * scale);

        // Resize on main thread using canvas
        const workCanvas = document.createElement('canvas');
        workCanvas.width = targetWidth;
        workCanvas.height = targetHeight;
        const ctx = workCanvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.srcCanvas, 0, 0, targetWidth, targetHeight);

        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

        const id = Date.now() + Math.random();
        this.callbacks.set(id, { onProgress, onComplete });

        // Check if custom palette needs to be passed
        let customPaletteData = null;
        if (paletteId.startsWith('custom_') && PALETTES[paletteId]) {
            customPaletteData = PALETTES[paletteId];
        }

        this.worker.postMessage({
            id,
            imageData,
            options,
            customPaletteData
        }, [imageData.data.buffer]);
    }
}
