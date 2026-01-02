/**
 * Manages DOM elements and UI interactions.
 */
export class UIManager {
    /**
     * Initializes the UI manager and caches DOM element references.
     */
    constructor() {
        this.els = {
            mainCanvas: document.getElementById('mainCanvas'),
            inpRes: document.getElementById('inpRes'),
            valRes: document.getElementById('valRes'),
            chkSnap: document.getElementById('chkSnap'),
            statusMsg: document.getElementById('statusMsg'),
            statusRes: document.getElementById('statusRes'),
            statusZoom: document.getElementById('statusZoom'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            canvasWrapper: document.getElementById('canvasWrapper'),
            viewport: document.getElementById('viewport'),
            dragOverlay: document.getElementById('dragOverlay'),
            fileInput: document.getElementById('fileInput'),
            paletteInput: document.getElementById('paletteInput'),
            inpAxis1: document.getElementById('inpAxis1'),
            inpAxis2: document.getElementById('inpAxis2'),
            inpAxis3: document.getElementById('inpAxis3'),
            numAxis1: document.getElementById('numAxis1'),
            numAxis2: document.getElementById('numAxis2'),
            numAxis3: document.getElementById('numAxis3'),
            wrapAxis1: document.getElementById('wrapAxis1'),
            wrapAxis2: document.getElementById('wrapAxis2'),
            wrapAxis3: document.getElementById('wrapAxis3'),
            lblAxis1: document.getElementById('lblAxis1'),
            lblAxis2: document.getElementById('lblAxis2'),
            lblAxis3: document.getElementById('lblAxis3'),
            selPalette: document.getElementById('selPalette'),
            btnCompare: document.getElementById('btnCompare'),
            menuBtnFile: document.getElementById('menuBtnFile'),
            dropdownFile: document.getElementById('dropdownFile'),
            menuBtnPref: document.getElementById('menuBtnPref'),
            dropdownPref: document.getElementById('dropdownPref'),
            menuBtnEdit: document.getElementById('menuBtnEdit'),
            dropdownEdit: document.getElementById('dropdownEdit'),
            menuUndo: document.getElementById('menuUndo'),
            menuRedo: document.getElementById('menuRedo'),
            menuLoad: document.getElementById('menuLoad'),
            menuSave: document.getElementById('menuSave'),
            menuZoomSnap: document.getElementById('menuZoomSnap'),
            checkZoomSnap: document.getElementById('check-zoom-snap'),
            inpContrast: document.getElementById('inpContrast'),
            valContrast: document.getElementById('valContrast'),
            inpBrightness: document.getElementById('inpBrightness'),
            valBrightness: document.getElementById('valBrightness'),
            inpSat: document.getElementById('inpSat'),
            valSat: document.getElementById('valSat'),
            selDither: document.getElementById('selDither'),
            selDither2: document.getElementById('selDither2'),
            inpDitherMix: document.getElementById('inpDitherMix'),
            valDitherMix: document.getElementById('valDitherMix'),
            inpDitherAmt: document.getElementById('inpDitherAmt'),
            valDitherAmt: document.getElementById('valDitherAmt')
        };
    }
}
