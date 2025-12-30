export class ImageProcessor {
    constructor() {
        this.srcCanvas = document.createElement('canvas');
        this.srcCtx = this.srcCanvas.getContext('2d');
        this.width = 0;
        this.height = 0;

        // Initialize Web Worker
        this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        this.pendingResolves = new Map();
        this.msgId = 0;

        this.worker.onmessage = (e) => {
            const { id, imageData, error, type, value } = e.data;
            if (type === 'progress') {
                const callbacks = this.pendingResolves.get(id);
                if (callbacks && callbacks.onProgress) callbacks.onProgress(value);
            } else {
                const callbacks = this.pendingResolves.get(id);
                if (callbacks) {
                    if (error) {
                        console.error('Worker error:', error);
                    } else {
                        callbacks.onComplete(imageData);
                    }
                    this.pendingResolves.delete(id);
                }
            }
        };
    }

    loadImage(img) {
        this.width = img.width;
        this.height = img.height;
        this.srcCanvas.width = this.width;
        this.srcCanvas.height = this.height;
        this.srcCtx.drawImage(img, 0, 0);
    }

    async process(options, onProgress, onComplete) {
        const { targetWidth } = options;
        const scale = targetWidth / this.width;
        const targetHeight = Math.floor(this.height * scale);

        // Resize on main thread using canvas (fast)
        const workCanvas = document.createElement('canvas');
        workCanvas.width = targetWidth;
        workCanvas.height = targetHeight;
        const ctx = workCanvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.srcCanvas, 0, 0, targetWidth, targetHeight);

        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

        const id = this.msgId++;
        this.pendingResolves.set(id, { onProgress, onComplete });

        // Send to worker
        this.worker.postMessage({
            id,
            imageData,
            width: targetWidth,
            height: targetHeight,
            options: JSON.parse(JSON.stringify(options)) // Ensure no non-clonable objects
        }, [imageData.data.buffer]); // Transfer buffer
    }
}
