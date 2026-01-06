import { ColorUtils } from './color_utils.js';
import { CONSTANTS } from './constants.js';
import { PALETTES } from './palettes.js';

/**
 * Handles image loading, processing, and pixel manipulation.
 * Now acts as a wrapper for the Web Worker.
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

        // Initialize worker
        this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = this.handleWorkerMessage.bind(this);

        this.callbacks = {
            onProgress: null,
            onComplete: null
        };
    }

    handleWorkerMessage(e) {
        const { type, progress, imageData } = e.data;
        if (type === 'progress') {
            if (this.callbacks.onProgress) this.callbacks.onProgress(progress);
        } else if (type === 'done') {
            if (this.callbacks.onComplete) this.callbacks.onComplete(imageData);
        }
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
     * Offloads heavy processing to the Web Worker.
     * @param {Object} options - Processing configuration (resolution, palette, dithering, etc.).
     * @param {function} onProgress - Callback for progress updates (0-1).
     * @param {function} onComplete - Callback with the final ImageData.
     */
    async process(options, onProgress, onComplete) {
        this.callbacks.onProgress = onProgress;
        this.callbacks.onComplete = onComplete;

        const { targetWidth, contrast, brightness, saturation, paletteId } = options;
        const scale = targetWidth / this.width;
        const targetHeight = Math.floor(this.height * scale);

        // Resize and pre-process on main thread (canvas ops are faster here)
        const workCanvas = document.createElement('canvas');
        workCanvas.width = targetWidth;
        workCanvas.height = targetHeight;
        const ctx = workCanvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.srcCanvas, 0, 0, targetWidth, targetHeight);

        let idata = ctx.getImageData(0, 0, targetWidth, targetHeight);
        let data = idata.data;
        const len = data.length;
        const bVal = brightness;
        const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        // Basic color adjustment (contrast, brightness, saturation)
        // This is fast enough to keep on main thread, or could be moved to worker too.
        // Moving to worker would require sending params, but we are doing it here
        // because we are already iterating for resize? No, resize is drawImage.
        // Let's keep it here for now to minimize worker message payload size (sending just buffer)
        // Wait, if we do it here, we modify the buffer before sending.
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

        // Resolve Palette
        let palette = [];
        let isMathMode = paletteId.startsWith('math_');
        if (!isMathMode) {
            if (paletteId.startsWith('auto')) {
                const count = parseInt(paletteId.replace('auto',''));
                if(count === 8) palette = PALETTES.cga1.concat(PALETTES.cga2);
                else if(count === 32) palette = PALETTES.vga.slice(0, 32);
                else palette = PALETTES.ega;
            } else { palette = PALETTES[paletteId] || PALETTES.vga; }
        }

        // Send to worker
        // We transfer the buffer to avoid copy overhead
        this.worker.postMessage({
            imageData: idata,
            options: { ...options, width: targetWidth, height: targetHeight },
            palette: palette
        }, [idata.data.buffer]);
    }
}
