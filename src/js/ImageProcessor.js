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
        this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = this.handleWorkerMessage.bind(this);
        this.onProgress = null;
        this.onComplete = null;
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

    handleWorkerMessage(e) {
        const { type, data } = e.data;
        if (type === 'progress') {
            if (this.onProgress) this.onProgress(data);
        } else if (type === 'complete') {
            if (this.onComplete) this.onComplete(data);
        }
    }

    /**
     * Processes the loaded image with the given options.
     * Offloads processing to the worker.
     * @param {Object} options - Processing configuration.
     * @param {function} onProgress - Callback for progress updates.
     * @param {function} onComplete - Callback with the final ImageData.
     */
    async process(options, onProgress, onComplete) {
        this.onProgress = onProgress;
        this.onComplete = onComplete;

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
        const idata = ctx.getImageData(0, 0, targetWidth, targetHeight);

        this.worker.postMessage({
            type: 'process',
            imageData: idata,
            options: { ...options, width: targetWidth, height: targetHeight }
        }); // transfer imageData buffer if possible? For now, structured clone.
    }
}
