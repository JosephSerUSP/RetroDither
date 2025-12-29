import { ColorUtils } from './ColorUtils.js';
import { DitherStrategies } from './DitherStrategies.js';
import { CONSTANTS } from './Constants.js';
import { PALETTES } from './Palettes.js';

export class ImageProcessor {
    constructor() {
        this.srcCanvas = document.createElement('canvas');
        this.srcCtx = this.srcCanvas.getContext('2d');
        this.width = 0;
        this.height = 0;

        // Initialize worker
        this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        this.callbacks = new Map();
        this.msgId = 0;

        this.worker.onmessage = (e) => {
            const { id, imageData } = e.data;
            if (this.callbacks.has(id)) {
                const { onComplete, width, height } = this.callbacks.get(id);
                // Reconstruct ImageData from buffer
                const arr = new Uint8ClampedArray(imageData);
                const imgData = new ImageData(arr, width, height);
                onComplete(imgData);
                this.callbacks.delete(id);
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

    // async process using worker
    async process(options, onProgress, onComplete) {
        const { targetWidth } = options;
        const scale = targetWidth / this.width;
        const targetHeight = Math.floor(this.height * scale);

        // Resize on main thread (simulating previous behavior)
        const workCanvas = document.createElement('canvas');
        workCanvas.width = targetWidth;
        workCanvas.height = targetHeight;
        const ctx = workCanvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.srcCanvas, 0, 0, targetWidth, targetHeight);

        const idata = ctx.getImageData(0, 0, targetWidth, targetHeight);

        // Send to worker
        const id = this.msgId++;
        this.callbacks.set(id, { onComplete, width: targetWidth, height: targetHeight });

        // We transfer the buffer to avoid copy overhead
        this.worker.postMessage({
            id,
            options,
            imageData: idata.data.buffer
        }, [idata.data.buffer]);
    }
}
