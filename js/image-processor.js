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
        this.worker = new Worker('js/worker.js', { type: 'module' });
        this.worker.onmessage = this.handleWorkerMessage.bind(this);
        this.currentCallbacks = null;
    }

    handleWorkerMessage(e) {
        const { type, data, progress } = e.data;

        if (type === 'progress') {
            if (this.currentCallbacks && this.currentCallbacks.onProgress) {
                this.currentCallbacks.onProgress(progress);
            }
        } else if (type === 'complete') {
            if (this.currentCallbacks && this.currentCallbacks.onComplete) {
                this.currentCallbacks.onComplete(data);
            }
            // We don't nullify callbacks immediately to avoid race conditions if multiple messages come?
            // Actually, once complete, this job is done.
             this.currentCallbacks = null;
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
     * @param {Object} options - Processing configuration.
     * @param {function} onProgress - Callback for progress updates.
     * @param {function} onComplete - Callback with the final ImageData.
     */
    process(options, onProgress, onComplete) {
        // If a previous job is running, we might want to terminate it to keep UI responsive.
        if (this.currentCallbacks) {
            this.worker.terminate();
            this.worker = new Worker('js/worker.js', { type: 'module' });
            this.worker.onmessage = this.handleWorkerMessage.bind(this);
        }

        this.currentCallbacks = { onProgress, onComplete };

        const { targetWidth } = options;
        const scale = targetWidth / this.width;
        const targetHeight = Math.floor(this.height * scale);

        const workCanvas = document.createElement('canvas');
        workCanvas.width = targetWidth;
        workCanvas.height = targetHeight;
        const ctx = workCanvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.srcCanvas, 0, 0, targetWidth, targetHeight);

        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

        // Resolve palette to send to worker
        // The worker handles PALETTES internally, but if we have a custom palette (dynamically added to PALETTES object),
        // we must pass it because the worker has a separate instance of the module.
        let sentPalette = null;
        if (!options.paletteId.startsWith('math_') && !options.paletteId.startsWith('auto')) {
            if (PALETTES[options.paletteId]) {
                sentPalette = PALETTES[options.paletteId];
            }
        }

        this.worker.postMessage({
            imageData,
            options,
            palette: sentPalette
        }, [imageData.data.buffer]);
    }
}
