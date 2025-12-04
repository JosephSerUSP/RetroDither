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
    -   **Algorithms**: Includes Ordered (Bayer), Floyd-Steinberg, Atkinson, Jarvis Judice & Ninke, Sierra Lite, and Stucki.
    -   **Mixing**: Blend two different dithering algorithms together.
    -   **Control**: Adjust dither amount and mix ratio.
-   **Viewport**:
    -   Zoom and Pan support.
    -   CRT-style scanline overlay.
    -   "Hold to Compare" feature to quickly view the original image.
-   **Export Options**: Save images at 1x, 2x, 4x, or 8x scale.

## Setup

Retro Pixel Lab is a single-file application. No build process, server, or installation is required.

1.  Download the `index.html` file.
2.  Open `index.html` in any modern web browser (Chrome, Firefox, Edge, Safari).

## Usage

### 1. Load an Image
-   Click **File > Load Image...** or simply **Drag & Drop** an image file onto the viewport.
-   A default sample image is loaded on startup.

### 2. Adjust Settings
Use the sidebar on the left to tweak the effect:
-   **Horizontal Scale**: Slide to change the pixel width. Use the **Snap** checkbox to lock to standard increments.
-   **Color Adjust**: Fine-tune contrast, brightness, and saturation.
-   **GPU Process**:
    -   Select a **Palette Mode** (Auto, Math, or Retro Hardware).
    -   If a "Math" mode is selected, additional sliders (Axis 1/2/3) will appear to control parameters like bit-depth or quantization steps.
    -   **Dither Mixing**: Select two algorithms (Algo A and Algo B) and use the **Mix** slider to blend them.
    -   **Amt**: Controls the intensity of the error diffusion/dithering.

### 3. Inspect
-   **Zoom**: Scroll the mouse wheel to zoom in/out. Toggle **Snap Zoom** in the **Preferences** menu for integer scaling (100%, 200%, etc.).
-   **Pan**: Click and drag on the viewport to move around.
-   **Compare**: Click and hold the **Hold to Compare** button to peek at the original image.

### 4. Save
-   Go to **Preferences** to select your desired **Export Scale** (e.g., 4x for a crisp pixel-art look on high-res screens).
-   Click **File > Save to Disk** to download the processed image.
