/**
 * Handles image loading, processing, and pixel manipulation using a Web Worker.
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
        this.callbacks = null;

        this.worker.onmessage = (e) => {
            if (!this.callbacks) return;
            const { type, value, idata } = e.data;
            if (type === 'progress') {
                this.callbacks.onProgress(value);
            } else if (type === 'complete') {
                this.callbacks.onComplete(idata);
                this.callbacks = null;
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
     * @param {function} onProgress - Callback for progress updates (0-1).
     * @param {function} onComplete - Callback with the final ImageData.
     */
    process(options, onProgress, onComplete) {
        if (this.callbacks) {
            // Cancel previous? Or just ignore.
            // For now, simple lock.
            console.warn('Processing already in progress');
            // But actually, we might want to restart with new options.
            // To do that, we'd need to terminate and restart the worker or support cancellation.
            // Let's just overwrite callbacks for now, effectively "cancelling" the old one's UI effect
            // but the worker will still compute.
            // ideally we terminate.
            this.worker.terminate();
            this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
            this.worker.onmessage = (e) => {
                if (!this.callbacks) return;
                const { type, value, idata } = e.data;
                if (type === 'progress') {
                    this.callbacks.onProgress(value);
                } else if (type === 'complete') {
                    this.callbacks.onComplete(idata);
                    this.callbacks = null;
                }
            };
        }

        this.callbacks = { onProgress, onComplete };

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

        // Transfer options and imageData to worker
        // Note: we can transfer the buffer of idata.data
        this.worker.postMessage({
            idata,
            options
        }, [idata.data.buffer]);
    }
}
