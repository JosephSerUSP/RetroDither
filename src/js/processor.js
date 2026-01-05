import { PALETTES } from './constants.js';

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

        // Initialize Web Worker
        this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        this.workerCallbacks = new Map();

        this.worker.onmessage = (e) => {
            const { id, success, data, error, width, height } = e.data;
            if (this.workerCallbacks.has(id)) {
                const callback = this.workerCallbacks.get(id);
                if (success) {
                    const imageData = new ImageData(data, width, height);
                    callback.resolve(imageData);
                } else {
                    callback.reject(new Error(error));
                }
                this.workerCallbacks.delete(id);
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
     * Processes the loaded image with the given options using the Web Worker.
     * @param {Object} options - Processing configuration (resolution, palette, dithering, etc.).
     * @param {function} onProgress - Callback for progress updates (deprecated in worker mode, kept for compatibility).
     * @param {function} onComplete - Callback with the final ImageData.
     */
    async process(options, onProgress, onComplete) {
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

        const idata = ctx.getImageData(0, 0, targetWidth, targetHeight);

        // Resolve palette on main thread to pass pure array to worker
        let palette = [];
        const isMathMode = paletteId.startsWith('math_');
        if (!isMathMode) {
            if (paletteId.startsWith('auto')) {
                const count = parseInt(paletteId.replace('auto',''));
                if(count === 8) palette = PALETTES.cga1.concat(PALETTES.cga2);
                else if(count === 32) palette = PALETTES.vga.slice(0, 32);
                else palette = PALETTES.ega;
            } else { palette = PALETTES[paletteId] || PALETTES.vga; }
        }

        const msgId = Date.now().toString();

        const promise = new Promise((resolve, reject) => {
            this.workerCallbacks.set(msgId, { resolve, reject });
        });

        // Pass ImageData buffer to worker
        this.worker.postMessage({
            id: msgId,
            imageData: {
                width: targetWidth,
                height: targetHeight,
                data: idata.data
            },
            options: { ...options, palette }
        }, [idata.data.buffer]);

        try {
            const result = await promise;
            onComplete(result);
        } catch (err) {
            console.error('Worker Processing Error:', err);
        }
    }
}
