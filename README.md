# Retro Pixel Lab

Retro Pixel Lab is a browser-based image processing tool designed to apply retro-style effects to images. It runs entirely in your web browser, allowing you to manipulate images with dithering, color palette limitations, and resolution scaling to mimic vintage computer graphics and gaming consoles.

## Features

-   **Image Loading & Saving**: Drag and drop images or load them via the file menu. Save your processed creations to disk.
-   **Resolution Scaling**: Adjust horizontal resolution with optional snapping (e.g., to 32px increments) to simulate low-res displays.
-   **Color Adjustments**: Real-time control over Contrast, Brightness, and Saturation.
-   **Palette Management**:
    -   **Presets**: Choose from classic palettes like Gameboy, CGA, EGA, VGA, Commodore 64, NES, and more.
    -   **Auto Extraction**: Automatically generate palettes (8, 16, or 32 colors) from the source image.
    -   **Procedural Math**: Use mathematical models (RGB Split, Bitcrush, Luma/Chroma) for dynamic color reduction.
    -   **Redmean Color Matching**: Toggle between Euclidean and Redmean color distance algorithms for better human perception matching.
-   **Dithering Engine**:
    -   **Algorithms**: Includes Ordered (Bayer), Blue Noise, Floyd-Steinberg, Atkinson, Jarvis Judice & Ninke, Sierra Lite, and Stucki.
    -   **Mixing**: Blend two different dithering algorithms together.
    -   **Control**: Adjust dither amount and mix ratio.
-   **Viewport**:
    -   Zoom and Pan support.
    -   CRT-style scanline overlay.
    -   "Hold to Compare" feature to quickly view the original image.
-   **Export Options**: Save images at 1x, 2x, 4x, or 8x scale.

## Setup

Retro Pixel Lab uses native ES Modules. No build process is strictly required for development, but a local server is needed to handle module imports correctly due to CORS.

1.  Clone the repository.
2.  Run a local server in the root directory.
    -   Python: `python3 -m http.server`
    -   Node: `npx http-server`
3.  Open `http://localhost:8000/index.html` in your browser.

## Architecture

The project is structured as follows:
-   `index.html`: Main entry point.
-   `src/js/`: JavaScript modules (`App`, `ImageProcessor`, `worker`, etc.).
-   `src/css/`: Stylesheets.

Image processing is offloaded to a Web Worker (`src/js/worker.js`) to ensure UI responsiveness.
