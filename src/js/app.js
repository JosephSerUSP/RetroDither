import { UIManager } from './ui.js';
import { ImageProcessor } from './processor.js';
import { PALETTES } from './palettes.js';

/**
 * Main application class connecting UI and ImageProcessor.
 */
export class App {
    /**
     * Initializes the application, state, and listeners.
     */
    constructor() {
        this.ui = new UIManager();
        this.processor = new ImageProcessor();
        this.ctx = this.ui.els.mainCanvas.getContext('2d');

        this.PALETTE_CONFIG = {
            'math_dynamic_xy': { labels: ['Steps', 'Bias (R/G)'], types: ['step', 'linear'], show: [true, true, false] },
            'math_rgb_split': { labels: ['R Steps', 'G Steps', 'B Steps'], types: ['step', 'step', 'step'], show: [true, true, true] },
            'math_luma_chroma': { labels: ['Luma', 'Chroma'], types: ['step', 'step'], show: [true, true, false] },
            'math_bitcrush': { labels: ['Bit Depth', 'Signal Floor'], types: ['step', 'linear'], show: [true, true, false] },
            'math_quant_rgb': { labels: ['Steps', ''], types: ['step', 'linear'], show: [true, false, false] },
            'math_quant_hsv': { labels: ['Steps', ''], types: ['step', 'linear'], show: [true, false, false] },
            'default': { show: [false, false, false] }
        };

        this.state = {
            width: 160,
            snapRes: true,
            contrast: 0,
            brightness: 0,
            saturation: 100,
            palette: 'auto16',
            ditherType1: 'bayer8',
            ditherType2: 'jjn',
            ditherMix: 50,
            ditherAmt: 50,
            exportScale: 1,
            zoom: 1, panX: 0, panY: 0,
            zoomSnap: true,
            axis1: 8, axis2: 50, axis3: 8,
            useRedmean: true
        };

        this.history = [];
        this.historyIndex = -1;

        this.originalSrc = null;
        this.processedData = null;
        this.isProcessing = false;

        this.initListeners();
        this.initDefaultImage();
    }

    /**
     * Calculates the step value from a slider position (exponential curve).
     * @param {number} val - Slider value (0-100).
     * @returns {number} The calculated step value (2-256).
     */
    getStepFromSlider(val) { if(val<=0) return 2; return Math.round(2 + 254 * Math.pow(val / 100, 3)); }

    /**
     * Calculates the slider position from a step value (inverse exponential).
     * @param {number} val - Step value (2-256).
     * @returns {number} The calculated slider value (0-100).
     */
    getSliderFromStep(val) { if(val<=2) return 0; return Math.pow((val - 2) / 254, 1/3) * 100; }

    /**
     * Converts a slider value (0-100) to a linear byte value (0-255).
     * @param {number} val - Slider value.
     * @returns {number} Byte value (0-255).
     */
    getLinearFromSlider(val) { return Math.round((val / 100) * 255); }

    /**
     * Converts a linear byte value (0-255) to a slider value (0-100).
     * @param {number} val - Byte value.
     * @returns {number} Slider value.
     */
    getSliderFromLinear(val) { return (val / 255) * 100; }

    /**
     * Updates the axis values in the state based on slider or number input.
     * Handles synchronization between slider and number box.
     * @param {string} idx - The axis index ('1', '2', or '3').
     * @param {string} source - The source of change ('slider' or 'number').
     */
    updateAxisValue(idx, source) {
        const slider = this.ui.els[`inpAxis${idx}`];
        const number = this.ui.els[`numAxis${idx}`];
        const config = this.PALETTE_CONFIG[this.state.palette] || this.PALETTE_CONFIG['default'];
        const type = config.types ? config.types[idx-1] : 'step';
        let finalVal;

        if (source === 'slider') {
            const sVal = parseFloat(slider.value);
            finalVal = (type === 'step') ? this.getStepFromSlider(sVal) : this.getLinearFromSlider(sVal);
            number.value = finalVal;
        } else {
            let nVal = parseInt(number.value) || 0;
            if(type === 'step') { nVal = Math.max(2, Math.min(256, nVal)); slider.value = this.getSliderFromStep(nVal); }
            else { nVal = Math.max(0, Math.min(255, nVal)); slider.value = this.getSliderFromLinear(nVal); }
            finalVal = nVal; number.value = finalVal;
        }
        this.state[`axis${idx}`] = finalVal;
        this.debounceProcess();
    }

    /**
     * Updates the UI state (visibility of axes) based on selected palette mode.
     */
    updateUIState() {
        const config = this.PALETTE_CONFIG[this.state.palette] || this.PALETTE_CONFIG['default'];
        const show = config.show || [false, false, false];
        ['1','2','3'].forEach((idx, i) => {
            const wrap = this.ui.els[`wrapAxis${idx}`];
            if (show[i]) {
                wrap.classList.remove('hidden');
                this.ui.els[`lblAxis${idx}`].innerText = config.labels[i];
                const val = this.state[`axis${idx}`];
                const type = config.types[i];
                this.ui.els[`numAxis${idx}`].value = val;
                this.ui.els[`inpAxis${idx}`].value = (type === 'step') ? this.getSliderFromStep(val) : this.getSliderFromLinear(val);
            } else { wrap.classList.add('hidden'); }
        });
    }

    saveHistory() {
        if (this.isRestoringHistory) return;
        // If we are not at the end of history, discard future
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(JSON.parse(JSON.stringify(this.state)));
        if (this.history.length > 50) this.history.shift();
        this.historyIndex = this.history.length - 1;
        this.updateUndoRedoUI();
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    restoreState(state) {
        this.isRestoringHistory = true;
        this.state = JSON.parse(JSON.stringify(state));
        this.updateControlsFromState();
        this.updateUIState();
        this.triggerProcess();
        this.updateUndoRedoUI();
        this.isRestoringHistory = false;
    }

    updateUndoRedoUI() {
        const canUndo = this.historyIndex > 0;
        const canRedo = this.historyIndex < this.history.length - 1;

        if (this.ui.els.menuUndo) {
            if (canUndo) {
                this.ui.els.menuUndo.classList.remove('disabled', 'text-gray-400');
                this.ui.els.menuUndo.style.cursor = 'pointer';
            } else {
                this.ui.els.menuUndo.classList.add('disabled', 'text-gray-400');
                this.ui.els.menuUndo.style.cursor = 'default';
            }
        }

        if (this.ui.els.menuRedo) {
            if (canRedo) {
                this.ui.els.menuRedo.classList.remove('disabled', 'text-gray-400');
                this.ui.els.menuRedo.style.cursor = 'pointer';
            } else {
                this.ui.els.menuRedo.classList.add('disabled', 'text-gray-400');
                this.ui.els.menuRedo.style.cursor = 'default';
            }
        }
    }

    updateControlsFromState() {
        try {
            const s = this.state;
            const els = this.ui.els;

            if(els.inpRes) els.inpRes.value = s.width;
            if(els.valRes) els.valRes.value = s.width;
            if(els.chkSnap) els.chkSnap.checked = s.snapRes;

            if(els.inpContrast) els.inpContrast.value = s.contrast;
            if(els.valContrast) els.valContrast.value = s.contrast;
            if(els.inpBrightness) els.inpBrightness.value = s.brightness;
            if(els.valBrightness) els.valBrightness.value = s.brightness;
            if(els.inpSat) els.inpSat.value = s.saturation;
            if(els.valSat) els.valSat.value = s.saturation;

            if(els.selPalette) els.selPalette.value = s.palette;
            const chkRedmean = document.getElementById('chkRedmean');
            if(chkRedmean) chkRedmean.checked = s.useRedmean;

            if(els.selDither) els.selDither.value = s.ditherType1;
            if(els.selDither2) els.selDither2.value = s.ditherType2;
            if(els.inpDitherMix) els.inpDitherMix.value = s.ditherMix;
            if(els.valDitherMix) els.valDitherMix.value = s.ditherMix;
            if(els.inpDitherAmt) els.inpDitherAmt.value = s.ditherAmt;
            if(els.valDitherAmt) els.valDitherAmt.value = s.ditherAmt;

            document.querySelectorAll('.scale-opt').forEach(el => {
                const id = `check-scale-${el.dataset.scale}`;
                const elCheck = document.getElementById(id);
                if(elCheck) elCheck.innerText = (parseInt(el.dataset.scale) === s.exportScale) ? '✓' : '';
            });
            if(els.checkZoomSnap) els.checkZoomSnap.innerText = s.zoomSnap ? '✓' : '';
            this.updateZoomStatus();
            this.updateTransform();
        } catch (e) {
            console.error('Error in updateControlsFromState:', e);
        }
    }

    /**
     * Initializes the default startup image.
     */
    initDefaultImage() {
        const img = new Image();
        img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiAAAABgADNjd8qAAAAABJRU5ErkJggg==";

        const defaultImg = new Image();
        defaultImg.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAABrrFhUAAAABlBMVEUAAAAAAAClZ7nPAAAAAXRSTlMAQObYZgAAAFRJREFUeNrtwQENAAAAwqD3T20PBxQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAODLABtAAAE41535AAAAAElFTkSuQmCC";
        defaultImg.onload = () => {
            const cvs = document.createElement('canvas');
            cvs.width = 400; cvs.height = 300;
            const ctx = cvs.getContext('2d');
            const grd = ctx.createLinearGradient(0,0,400,300);
            grd.addColorStop(0, "#ff0080");
            grd.addColorStop(0.5, "#8000ff");
            grd.addColorStop(1, "#00ffff");
            ctx.fillStyle = grd;
            ctx.fillRect(0,0,400,300);
            ctx.fillStyle = "white";
            ctx.font = "bold 40px monospace";
            ctx.fillText("DROP IMAGE", 80, 150);
            const finalImg = new Image();
            finalImg.onload = () => {
                this.originalSrc = finalImg;
                this.processor.loadImage(finalImg);
                this.triggerProcess();
                this.saveHistory();
            };
            finalImg.src = cvs.toDataURL();
        };
    }

    /**
     * Initializes all event listeners for UI controls.
     */
    initListeners() {
        // Universal Bind for Slider <-> Input synchronization
        const bind = (id, key) => {
            const slider = document.getElementById(id);
            const number = document.getElementById(id.replace('inp', 'val'));

            if(!slider) return;

            slider.addEventListener('input', (e) => {
                const v = parseInt(e.target.value);
                this.state[key] = v;
                if(number) number.value = v;
                this.debounceProcess();
            });
            slider.addEventListener('change', () => this.saveHistory());

            if(number) {
                number.addEventListener('input', (e) => {
                    let v = parseInt(e.target.value);
                    if(isNaN(v)) return;
                    // Clamp
                    const min = parseInt(slider.min);
                    const max = parseInt(slider.max);
                    v = Math.max(min, Math.min(max, v));

                    this.state[key] = v;
                    slider.value = v;
                    this.debounceProcess();
                });
                number.addEventListener('blur', () => {
                    if (number.value === '' || isNaN(parseInt(number.value))) {
                        number.value = this.state[key];
                    }
                });
                number.addEventListener('change', () => this.saveHistory());
            }
        };

        const { inpRes, valRes, chkSnap, menuBtnFile, dropdownFile, menuBtnPref, dropdownPref, menuBtnEdit, dropdownEdit } = this.ui.els;

        // Menu Logic
        const closeMenus = () => {
            dropdownFile.classList.remove('show');
            dropdownPref.classList.remove('show');
            dropdownEdit.classList.remove('show');
        };
        menuBtnFile.addEventListener('click', (e) => { e.stopPropagation(); const o = dropdownFile.classList.contains('show'); closeMenus(); if(!o) dropdownFile.classList.add('show'); });
        menuBtnPref.addEventListener('click', (e) => { e.stopPropagation(); const o = dropdownPref.classList.contains('show'); closeMenus(); if(!o) dropdownPref.classList.add('show'); });
        menuBtnEdit.addEventListener('click', (e) => { e.stopPropagation(); const o = dropdownEdit.classList.contains('show'); closeMenus(); if(!o) dropdownEdit.classList.add('show'); });

        this.ui.els.menuUndo.addEventListener('click', (e) => { e.stopPropagation(); this.undo(); closeMenus(); });
        this.ui.els.menuRedo.addEventListener('click', (e) => { e.stopPropagation(); this.redo(); closeMenus(); });

        document.addEventListener('click', closeMenus);

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); this.redo(); }
        });

        // Paste support
        document.addEventListener('paste', (e) => {
            if (e.clipboardData && e.clipboardData.items) {
                for (let i = 0; i < e.clipboardData.items.length; i++) {
                    const item = e.clipboardData.items[i];
                    if (item.type.startsWith('image/')) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        this.handleFile(file);
                        break;
                    }
                }
            }
        });

        this.ui.els.menuLoad.addEventListener('click', () => this.ui.els.fileInput.click());
        this.ui.els.menuSave.addEventListener('click', () => this.saveImage());

        // Zoom Snap Toggle
        this.ui.els.menuZoomSnap.addEventListener('click', (e) => {
            e.stopPropagation(); // Keep menu open? Or close. Let's close.
            this.state.zoomSnap = !this.state.zoomSnap;
            this.ui.els.checkZoomSnap.innerText = this.state.zoomSnap ? '✓' : '';
        });

        document.querySelectorAll('.scale-opt').forEach(el => {
            el.addEventListener('click', (e) => {
                const s = parseInt(el.dataset.scale);
                this.state.exportScale = s;
                document.querySelectorAll('[id^="check-scale-"]').forEach(c => c.innerText = '');
                document.getElementById(`check-scale-${s}`).innerText = '✓';
            });
        });

        // Resolution Special Case (Snap vs Text Input)
        inpRes.addEventListener('input', (e) => {
            let val = parseInt(e.target.value);
            this.state.width = val;
            valRes.value = val;
            this.debounceProcess();
        });

        valRes.addEventListener('input', (e) => {
             let val = parseInt(e.target.value);
             if(isNaN(val)) return;
             // Snap logic check? If typing manually, maybe don't force snap until blur?
             // For now direct mapping
             this.state.width = val;
             inpRes.value = val;
             this.debounceProcess();
        });

        chkSnap.addEventListener('change', (e) => {
            this.state.snapRes = e.target.checked;
            if(this.state.snapRes) {
                inpRes.step = "32";
                const val = parseInt(inpRes.value);
                const closest = Math.round(val / 32) * 32;
                inpRes.value = closest;
                valRes.value = closest;
                this.state.width = closest;
                this.debounceProcess();
            } else {
                inpRes.step = "2";
            }
        });

        bind('inpContrast', 'contrast');
        bind('inpBrightness', 'brightness');
        bind('inpSat', 'saturation');
        bind('inpDitherMix', 'ditherMix');
        bind('inpDitherAmt', 'ditherAmt');

        // Bind Selects
        const simpleBind = (id, key) => {
            const el = document.getElementById(id);
            el.addEventListener('change', (e) => {
                this.state[key] = e.target.value;
                this.debounceProcess();
                this.saveHistory();
            });
        };
        simpleBind('selDither', 'ditherType1');
        simpleBind('selDither2', 'ditherType2');

        this.ui.els.selPalette.addEventListener('change', (e) => {
            if (e.target.value === 'import_custom') {
                e.target.value = this.state.palette; // Revert selection
                this.ui.els.paletteInput.click();
                return;
            }
            this.state.palette = e.target.value;
            this.updateUIState();
            this.debounceProcess();
            this.saveHistory();
        });

        this.ui.els.paletteInput.addEventListener('change', (e) => {
             if(e.target.files.length > 0) {
                 this.handlePaletteFile(e.target.files[0]);
                 e.target.value = '';
             }
        });

        document.getElementById('chkRedmean').addEventListener('change', (e) => {
            this.state.useRedmean = e.target.checked;
            this.debounceProcess();
            this.saveHistory();
        });

        ['1','2','3'].forEach(idx => {
            this.ui.els[`inpAxis${idx}`].addEventListener('input', () => this.updateAxisValue(idx, 'slider'));
            this.ui.els[`inpAxis${idx}`].addEventListener('change', () => this.saveHistory());
            this.ui.els[`numAxis${idx}`].addEventListener('change', () => { this.updateAxisValue(idx, 'number'); this.saveHistory(); });
        });

        this.ui.els.fileInput.addEventListener('change', (e) => this.handleFile(e.target.files[0]));

        const vp = this.ui.els.viewport;
        const overlay = this.ui.els.dragOverlay;
        let dragCounter = 0;
        vp.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dragCounter++;
            overlay.classList.remove('hidden');
        });
        vp.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter <= 0) {
                overlay.classList.add('hidden');
                dragCounter = 0;
            }
        });
        vp.addEventListener('dragover', (e) => { e.preventDefault(); });
        vp.addEventListener('drop', (e) => {
            e.preventDefault();
            dragCounter = 0;
            overlay.classList.add('hidden');
            this.handleFile(e.dataTransfer.files[0]);
        });

        const btnCompare = this.ui.els.btnCompare;
        const showOriginal = () => { if(!this.originalSrc) return; this.ctx.drawImage(this.originalSrc, 0, 0, this.ui.els.mainCanvas.width, this.ui.els.mainCanvas.height); };
        const showProcessed = () => { if(!this.processedData) return; this.ctx.putImageData(this.processedData, 0, 0); };

        btnCompare.addEventListener('mousedown', showOriginal);
        btnCompare.addEventListener('mouseup', showProcessed);
        btnCompare.addEventListener('mouseleave', showProcessed);
        btnCompare.addEventListener('touchstart', (e) => { e.preventDefault(); showOriginal(); });
        btnCompare.addEventListener('touchend', (e) => { e.preventDefault(); showProcessed(); });

        this.setupViewportInteraction();
        this.updateUIState();
    }

    /**
     * Parses and loads a custom palette from a file (.hex or image).
     * @param {File} file
     */
    handlePaletteFile(file) {
        if (file.name.toLowerCase().endsWith('.hex') || file.name.toLowerCase().endsWith('.txt')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                const colors = [];
                const lines = text.split(/\r?\n/);
                for (let line of lines) {
                    line = line.trim();
                    if (!line || line.startsWith(';') || line.startsWith('//')) continue;
                    // match hex: #RRGGBB or RRGGBB
                    const match = line.match(/^#?([0-9A-Fa-f]{6})$/);
                    if (match) {
                        const hex = match[1];
                        const r = parseInt(hex.substring(0,2), 16);
                        const g = parseInt(hex.substring(2,4), 16);
                        const b = parseInt(hex.substring(4,6), 16);
                        colors.push([r,g,b]);
                    }
                }
                if (colors.length > 0) {
                    this.addCustomPalette(file.name, colors);
                } else {
                    alert('No valid hex colors found in file.');
                }
            };
            reader.readAsText(file);
        } else if (file.type.startsWith('image/')) {
             const reader = new FileReader();
             reader.onload = (e) => {
                 const img = new Image();
                 img.onload = () => {
                     const cvs = document.createElement('canvas');
                     cvs.width = img.width; cvs.height = img.height;
                     const ctx = cvs.getContext('2d');
                     ctx.drawImage(img, 0, 0);
                     const data = ctx.getImageData(0,0,img.width,img.height).data;
                     const colorSet = new Set();
                     const colors = [];
                     // Limit scanning to avoid freezing, target ~100k samples max
                     const step = Math.max(1, Math.floor((img.width * img.height) / 100000));

                     for(let i=0; i<data.length; i+=4*step) {
                         if(data[i+3] < 128) continue; // transparent
                         const r = data[i], g = data[i+1], b = data[i+2];
                         const key = `${r},${g},${b}`;
                         if(!colorSet.has(key)) {
                             colorSet.add(key);
                             colors.push([r,g,b]);
                             if(colors.length >= 256) break; // Limit to 256
                         }
                     }

                     if (colors.length > 0) {
                         this.addCustomPalette(file.name, colors);
                     } else {
                         alert('Could not extract colors from image.');
                     }
                 };
                 img.src = e.target.result;
             };
             reader.readAsDataURL(file);
        }
    }

    addCustomPalette(name, colors) {
        const id = 'custom_' + Date.now();
        PALETTES[id] = colors;

        const select = this.ui.els.selPalette;
        let customGroup = select.querySelector('optgroup[label="Custom"]');
        if (!customGroup) {
            customGroup = document.createElement('optgroup');
            customGroup.label = "Custom";
            // Insert before "Actions"
            const actions = select.querySelector('optgroup[label="Actions"]');
            if (actions) select.insertBefore(customGroup, actions);
            else select.appendChild(customGroup);
        }

        const opt = document.createElement('option');
        opt.value = id;
        opt.innerText = name.length > 20 ? name.substring(0,18)+'...' : name;
        opt.innerText += ` (${colors.length})`;
        customGroup.appendChild(opt);

        select.value = id;
        this.state.palette = id;
        this.updateUIState();
        this.debounceProcess();
        this.saveHistory();
    }

    /**
     * Handles file input change (drag/drop or menu).
     * @param {File} file - The uploaded file.
     */
    handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.originalSrc = img;
                this.processor.loadImage(img);
                this.state.zoom = 1; this.state.panX = 0; this.state.panY = 0;
                this.updateTransform();
                this.updateZoomStatus();
                this.triggerProcess();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    /**
     * Sets up mouse and touch interactions for the viewport (pan and zoom).
     */
    setupViewportInteraction() {
        const container = this.ui.els.viewport;
        let isDragging = false;
        let lastX, lastY;
        container.addEventListener('wheel', (e) => {
            e.preventDefault();

            if (this.state.zoomSnap) {
                // Snap mode: +/- 100% (1.0)
                const direction = e.deltaY > 0 ? -1 : 1;
                let newZoom = Math.round(this.state.zoom + direction);
                newZoom = Math.max(1, newZoom); // Minimum 100%
                this.state.zoom = newZoom;
            } else {
                // Fluid mode
                this.state.zoom *= (e.deltaY > 0 ? 0.9 : 1.1);
            }

            this.updateTransform();
            this.updateZoomStatus();
        });
        container.addEventListener('mousedown', (e) => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            this.state.panX += e.clientX - lastX; this.state.panY += e.clientY - lastY;
            lastX = e.clientX; lastY = e.clientY;
            this.updateTransform();
        });
        window.addEventListener('mouseup', () => isDragging = false);
        container.addEventListener('touchstart', (e) => { if(e.touches.length === 1) { isDragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; } });
        container.addEventListener('touchmove', (e) => { if(isDragging && e.touches.length === 1) { e.preventDefault(); this.state.panX += e.touches[0].clientX - lastX; this.state.panY += e.touches[0].clientY - lastY; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; this.updateTransform(); } });
        container.addEventListener('touchend', () => isDragging = false);

        // Zoom Buttons
        const handleZoom = (direction) => {
            if (this.state.zoomSnap) {
                let newZoom = Math.round(this.state.zoom + direction);
                newZoom = Math.max(1, newZoom);
                this.state.zoom = newZoom;
            } else {
                this.state.zoom *= (direction > 0 ? 1.25 : 0.8);
            }
            this.updateTransform();
            this.updateZoomStatus();
        };

        if(this.ui.els.btnZoomIn) this.ui.els.btnZoomIn.addEventListener('click', () => handleZoom(1));
        if(this.ui.els.btnZoomOut) this.ui.els.btnZoomOut.addEventListener('click', () => handleZoom(-1));
    }

    /**
     * Updates the CSS transform of the canvas based on zoom and pan state.
     */
    updateTransform() {
        this.ui.els.canvasWrapper.style.transform = `translate(${this.state.panX}px, ${this.state.panY}px) scale(${this.state.zoom})`;
    }

    /**
     * Updates the zoom percentage display in the status bar.
     */
    updateZoomStatus() {
        this.ui.els.statusZoom.innerText = `${Math.round(this.state.zoom * 100)}%`;
    }

    /**
     * Debounces the image processing to prevent excessive re-renders during slider dragging.
     */
    debounceProcess() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.triggerProcess(), 200);
    }

    /**
     * Triggers the image processing pipeline with the current state.
     * Manages loading states and UI updates.
     */
    triggerProcess() {
        if (!this.originalSrc || this.isProcessing) return;
        this.isProcessing = true;
        this.ui.els.loadingOverlay.classList.remove('hidden');

        let palette = null;
        // If not procedural (math) or auto (handled by worker for now, though it seems static),
        // try to resolve the palette array from the main thread's PALETTES.
        if (!this.state.palette.startsWith('math_') && !this.state.palette.startsWith('auto')) {
             palette = PALETTES[this.state.palette];
        }

        const options = {
            ...this.state,
            targetWidth: this.state.width,
            paletteId: this.state.palette,
            palette: palette
        };

        this.processor.process(options, () => {}, (imgData) => {
            this.processedData = imgData;
            this.ui.els.mainCanvas.width = imgData.width;
            this.ui.els.mainCanvas.height = imgData.height;
            this.ctx.putImageData(imgData, 0, 0);
            this.ui.els.statusMsg.innerText = "DONE.";
            this.ui.els.statusRes.innerText = `${imgData.width} x ${imgData.height}`;
            this.ui.els.loadingOverlay.classList.add('hidden');
            this.isProcessing = false;
        });
    }

    /**
     * Saves the processed image to the user's computer.
     * Upscales the image if an export scale factor is set.
     */
    saveImage() {
        if(!this.processedData) return;
        const exportCvs = document.createElement('canvas');
        const w = this.processedData.width, h = this.processedData.height, s = this.state.exportScale;
        exportCvs.width = w * s; exportCvs.height = h * s;
        const ctx = exportCvs.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const tmp = document.createElement('canvas');
        tmp.width = w; tmp.height = h;
        tmp.getContext('2d').putImageData(this.processedData, 0, 0);
        ctx.drawImage(tmp, 0, 0, w * s, h * s);
        const link = document.createElement('a');
        link.download = `retro_lab_${Date.now()}.png`;
        link.href = exportCvs.toDataURL();
        link.click();
    }
}
