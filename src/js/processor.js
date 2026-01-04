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

        this.worker.onmessage = (e) => {
            const { imageData } = e.data;
            const resultImageData = new ImageData(new Uint8ClampedArray(imageData), this.pendingOptions.width, this.pendingOptions.height);
            this.pendingCallback(resultImageData);
            this.pendingCallback = null;
            this.pendingOptions = null;
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
     * @param {Object} options - Processing configuration (resolution, palette, dithering, etc.).
     * @param {function} onProgress - Callback for progress updates (0-1).
     * @param {function} onComplete - Callback with the final ImageData.
     */
    async process(options, onProgress, onComplete) {
        if (this.pendingCallback) return; // Busy

        const { targetWidth } = options;
        const scale = targetWidth / this.width;
        const targetHeight = Math.floor(this.height * scale);

        // Resize on main thread using canvas (fastest way)
        const workCanvas = document.createElement('canvas');
        workCanvas.width = targetWidth;
        workCanvas.height = targetHeight;
        const ctx = workCanvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.srcCanvas, 0, 0, targetWidth, targetHeight);

        const idata = ctx.getImageData(0, 0, targetWidth, targetHeight);

        this.pendingCallback = onComplete;
        this.pendingOptions = { width: targetWidth, height: targetHeight };

        // Offload heavy lifting to worker
        this.worker.postMessage({
            imageData: idata.data.buffer,
            width: targetWidth,
            height: targetHeight,
            options: options
        }, [idata.data.buffer]);
    }
}
