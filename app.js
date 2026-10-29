/* ============================================================
   SPECTRA LAB — app.js
   All client-side logic: navigation, image analysis, charts,
   calibration, comparison, export, demo mode.
   No external dependencies except Chart.js (CDN).
   ============================================================ */

'use strict';

/* ─────────────────────────────────────────────
   STATE
───────────────────────────────────────────── */
const STATE = {
  // Main analysis & interactive image editor
  imageFile: null,
  originalCanvas: null,     // Pristine uncropped source image canvas
  workingCanvas: null,      // Current working image canvas (can be cropped / rotated)
  imageNaturalW: 0,
  imageNaturalH: 0,
  displayScale: 1,          // Display canvas / image ratio
  isCropped: false,
  editorMode: 'spectrum',   // 'spectrum' | 'crop'
  spectrumRect: { x: 0, y: 0, w: 0, h: 0 }, // Region in working canvas px
  cropRect: { x: 0, y: 0, w: 0, h: 0 },     // Crop box in working canvas px
  peakThreshold: 15,        // minimum peak prominence
  analysisResult: null,     // { labels[], brightness[], r[], g[], b[], peaks[], stats }
  sourceLabel: '',
  isDemo: false,

  // Calibration
  calibPoints: [],          // [{px, wl}]
  calibEq: null,            // {a, b} → wl = a*px + b

  // Compare
  compareA: { file: null, bitmap: null, w: 0, h: 0, selTop: 30, selHeight: 40, result: null },
  compareB: { file: null, bitmap: null, w: 0, h: 0, selTop: 30, selHeight: 40, result: null },

  // Charts
  charts: {
    brightness: null,
    rgb: null,
    calib: null,
    compare: null,
  },
};

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const MAX_FILE_MB  = 15;
const PEAK_MIN_SEP = 8; // minimum horizontal distance between detected peaks

/* ─────────────────────────────────────────────
   CHART.JS DEFAULTS
───────────────────────────────────────────── */
Chart.defaults.color          = '#8892a4';
Chart.defaults.borderColor    = 'rgba(255,255,255,0.07)';
Chart.defaults.font.family    = "'Inter', sans-serif";
Chart.defaults.font.size      = 11;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding  = 14;
Chart.defaults.elements.point.radius = 0;
Chart.defaults.elements.point.hoverRadius = 4;
Chart.defaults.elements.line.tension = 0.3;
Chart.defaults.elements.line.borderWidth = 1.8;

/* ─────────────────────────────────────────────
   NAVIGATION
───────────────────────────────────────────── */
const PAGE_META = {
  overview: { title: 'Overview',          badge: 'DIY Spectroscope'   },
  analysis: { title: 'Spectrum Analysis', badge: 'Image Processing'   },
  compare:  { title: 'Compare Spectra',   badge: 'Source Comparison'  },
  results:  { title: 'Results & Export',  badge: 'Lab Report'         },
  physics:  { title: 'Physics & Theory',  badge: 'Diffraction Principles' },
};

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const view = document.getElementById(`view-${name}`);
  const btn  = document.getElementById(`nav-${name}`);
  if (view) view.classList.add('active');
  if (btn)  btn.classList.add('active');
  const meta = PAGE_META[name] || {};
  document.getElementById('pageTitle').textContent = meta.title || name;
  document.getElementById('pageBadge').textContent = meta.badge || '';
  // Close sidebar on mobile
  if (window.innerWidth <= 800) document.getElementById('sidebar').classList.remove('open');
}

document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

document.getElementById('hamburgerBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// Hero buttons
document.getElementById('startAnalysisBtn').addEventListener('click', () => switchView('analysis'));
document.getElementById('exploreBtn').addEventListener('click', () => {
  loadDemoData();
  switchView('analysis');
});

/* ─────────────────────────────────────────────
   TOAST NOTIFICATIONS
───────────────────────────────────────────── */
function toast(msg, type = 'info', duration = 3500) {
  const icons = {
    success: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warn:    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = (icons[type] || icons.info) + `<span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

/* ─────────────────────────────────────────────
   INTERACTIVE IMAGE EDITOR & CROPPING / SPECTRUM TOOL
───────────────────────────────────────────── */
const fileInput          = document.getElementById('fileInput');
const uploadZone         = document.getElementById('uploadZone');
const previewPanel       = document.getElementById('imagePreviewPanel');
const previewCanvas      = document.getElementById('previewCanvas');
const pCtx               = previewCanvas.getContext('2d');
const canvasWrapper      = document.getElementById('canvasWrapper');
const selectionOverlay   = document.getElementById('selectionOverlay');
const selectionBox       = document.getElementById('selectionBox');
const selectionBadge     = document.getElementById('selectionBadge');
const coordVal           = document.getElementById('coordVal');
const peakThreshRange    = document.getElementById('peakThreshRange');
const peakThreshVal      = document.getElementById('peakThreshVal');
const editorTipText      = document.getElementById('editorTipText');
const editorTip          = document.getElementById('editorTip');
const toolSelectSpectrumBtn = document.getElementById('toolSelectSpectrumBtn');
const toolCropBtn        = document.getElementById('toolCropBtn');
const cropActionGroup    = document.getElementById('cropActionGroup');
const spectrumActionGroup= document.getElementById('spectrumActionGroup');
const applyCropBtn       = document.getElementById('applyCropBtn');
const cancelCropBtn      = document.getElementById('cancelCropBtn');
const resetOriginalBtn   = document.getElementById('resetOriginalBtn');
const revertCroppedBtn   = document.getElementById('revertCroppedImageBtn');
const rotateImageBtn     = document.getElementById('rotateImageBtn');
const resetRegionBtn     = document.getElementById('resetRegionBtn');
const analyseBtn         = document.getElementById('analyseBtn');
const removeImageBtn     = document.getElementById('removeImageBtn');

// Dim mask elements
const maskTop    = document.getElementById('maskTop');
const maskBottom = document.getElementById('maskBottom');
const maskLeft   = document.getElementById('maskLeft');
const maskRight  = document.getElementById('maskRight');

// Drag and drop listeners
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) handleFileUpload(f);
});
uploadZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileUpload(fileInput.files[0]);
  fileInput.value = '';
});
removeImageBtn.addEventListener('click', clearImage);

function validateFile(file) {
  const ALLOWED = ['image/jpeg', 'image/png'];
  if (!ALLOWED.includes(file.type)) {
    return 'Unsupported file type. Please upload a JPG or PNG image.';
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return `File is too large (${(file.size/1024/1024).toFixed(1)} MB). Maximum is ${MAX_FILE_MB} MB.`;
  }
  return null;
}

/**
 * Handle new image upload.
 * Stores original uncropped image, creates working canvas, and initializes selection.
 */
async function handleFileUpload(file) {
  STATE.isDemo = false;
  hideDemoBanners();

  const errDiv = document.getElementById('uploadError');
  errDiv.style.display = 'none';

  const err = validateFile(file);
  if (err) {
    errDiv.innerHTML = `<div class="alert alert-error"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>${err}</div>`;
    errDiv.style.display = 'block';
    toast(err, 'error');
    return;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const origCanvas = document.createElement('canvas');
    origCanvas.width  = bitmap.width;
    origCanvas.height = bitmap.height;
    origCanvas.getContext('2d').drawImage(bitmap, 0, 0);

    const workCanvas = document.createElement('canvas');
    workCanvas.width  = bitmap.width;
    workCanvas.height = bitmap.height;
    workCanvas.getContext('2d').drawImage(bitmap, 0, 0);

    STATE.imageFile      = file;
    STATE.originalCanvas = origCanvas;
    STATE.workingCanvas  = workCanvas;
    STATE.imageNaturalW  = bitmap.width;
    STATE.imageNaturalH  = bitmap.height;
    STATE.isCropped      = false;
    STATE.analysisResult = null;

    // Initialize crop and spectrum boxes in working image coordinates
    initDefaultSelections(bitmap.width, bitmap.height);

    showPreviewPanel(file);
    setEditorMode('spectrum');
    renderPreviewCanvas();
    updateOverlayUI();
    updateWorkflowUI(3);
    resetStatCards();
    hideCharts();
    analyseBtn.disabled = false;
    document.getElementById('uploadStatus').textContent = 'Ready';
    toast('Image loaded. Select the spectrum region or crop if needed.', 'success');

    // Run initial analysis automatically so user immediately sees results
    analyseImage(false);
  } catch (e) {
    console.error(e);
    toast('Could not read the image file. It may be corrupted.', 'error');
  }
}

/**
 * Initialize default crop and spectrum boxes.
 */
function initDefaultSelections(W, H) {
  // Default crop box: 90% of image centered
  STATE.cropRect = {
    x: Math.round(W * 0.05),
    y: Math.round(H * 0.05),
    w: Math.round(W * 0.90),
    h: Math.round(H * 0.90),
  };

  // Default spectrum box: horizontal band across center
  STATE.spectrumRect = {
    x: Math.round(W * 0.05),
    y: Math.round(H * 0.25),
    w: Math.round(W * 0.90),
    h: Math.round(H * 0.50),
  };
}

/**
 * Render the working image onto previewCanvas maintaining aspect ratio.
 */
function renderPreviewCanvas() {
  if (!STATE.workingCanvas) return;
  const container = canvasWrapper.parentElement;
  const maxW = Math.max(280, Math.min(container.clientWidth - 32 || 740, 780));
  const maxH = 460;
  const W = STATE.workingCanvas.width;
  const H = STATE.workingCanvas.height;

  // Exact aspect ratio preserved without stretching
  const scale = Math.min(maxW / W, maxH / H, 1);
  STATE.displayScale = scale;

  const dispW = Math.round(W * scale);
  const dispH = Math.round(H * scale);

  previewCanvas.width  = dispW;
  previewCanvas.height = dispH;
  previewCanvas.style.width  = `${dispW}px`;
  previewCanvas.style.height = `${dispH}px`;

  canvasWrapper.style.width  = `${dispW}px`;
  canvasWrapper.style.height = `${dispH}px`;

  pCtx.clearRect(0, 0, dispW, dispH);
  pCtx.drawImage(STATE.workingCanvas, 0, 0, dispW, dispH);

  updateOverlayUI();
}

/**
 * Update UI overlay (selection box, 8 handles, and 4 dim masks).
 */
function updateOverlayUI() {
  if (!STATE.workingCanvas) return;
  const rect = STATE.editorMode === 'crop' ? STATE.cropRect : STATE.spectrumRect;
  const s = STATE.displayScale;
  const cw = previewCanvas.width;
  const ch = previewCanvas.height;

  // Convert to screen coordinates
  const sx = Math.max(0, Math.min(cw - 10, Math.round(rect.x * s)));
  const sy = Math.max(0, Math.min(ch - 10, Math.round(rect.y * s)));
  const sw = Math.max(10, Math.min(cw - sx, Math.round(rect.w * s)));
  const sh = Math.max(10, Math.min(ch - sy, Math.round(rect.h * s)));

  // Position selection box
  selectionBox.style.left   = `${sx}px`;
  selectionBox.style.top    = `${sy}px`;
  selectionBox.style.width  = `${sw}px`;
  selectionBox.style.height = `${sh}px`;

  // Position the 4 dim masks around the active box
  maskTop.style.left   = '0px';
  maskTop.style.top    = '0px';
  maskTop.style.width  = '100%';
  maskTop.style.height = `${sy}px`;

  maskBottom.style.left   = '0px';
  maskBottom.style.top    = `${sy + sh}px`;
  maskBottom.style.width  = '100%';
  maskBottom.style.height = `${Math.max(0, ch - (sy + sh))}px`;

  maskLeft.style.left   = '0px';
  maskLeft.style.top    = `${sy}px`;
  maskLeft.style.width  = `${sx}px`;
  maskLeft.style.height = `${sh}px`;

  maskRight.style.left   = `${sx + sw}px`;
  maskRight.style.top    = `${sy}px`;
  maskRight.style.width  = `${Math.max(0, cw - (sx + sw))}px`;
  maskRight.style.height = `${sh}px`;

  // Update coordinate label
  const x1 = Math.round(rect.x);
  const x2 = Math.round(rect.x + rect.w);
  const y1 = Math.round(rect.y);
  const y2 = Math.round(rect.y + rect.h);
  const w  = Math.round(rect.w);
  const h  = Math.round(rect.h);
  coordVal.textContent = `X: ${x1}–${x2} px · Y: ${y1}–${y2} px (${w} × ${h} px)`;
}

/**
 * Switch between 'spectrum' (rainbow band selection) and 'crop' (image crop) modes.
 */
function setEditorMode(mode) {
  STATE.editorMode = mode;

  if (mode === 'crop') {
    toolCropBtn.classList.add('active-tool', 'crop-active');
    toolSelectSpectrumBtn.classList.remove('active-tool');
    cropActionGroup.style.display     = 'flex';
    spectrumActionGroup.style.display = 'none';
    editorTip.classList.add('crop-tip');
    editorTipText.textContent = 'Crop Tool: Drag the box or handles to select the spectroscope area to keep. Click "Apply Crop" to cut away background.';
    selectionBox.className = 'selection-box mode-crop';
    selectionBadge.textContent = 'Crop Area';
    updateWorkflowUI(2);
  } else {
    toolSelectSpectrumBtn.classList.add('active-tool');
    toolCropBtn.classList.remove('active-tool', 'crop-active');
    cropActionGroup.style.display     = 'none';
    spectrumActionGroup.style.display = 'flex';
    editorTip.classList.remove('crop-tip');
    editorTipText.textContent = 'Spectrum Selection: Drag the box or handles to enclose only the rainbow spectrum. Only pixels inside are analysed.';
    selectionBox.className = 'selection-box mode-spectrum';
    selectionBadge.textContent = 'Spectrum Region';
    updateWorkflowUI(3);
  }

  revertCroppedBtn.style.display = STATE.isCropped ? 'inline-flex' : 'none';
  updateOverlayUI();
}

toolSelectSpectrumBtn.addEventListener('click', () => setEditorMode('spectrum'));
toolCropBtn.addEventListener('click', () => setEditorMode('crop'));

/* ── Interactive Pointer & Touch Dragging Engine ── */
let dragAction = null; // 'move' | 'resize' | 'draw'
let dragHandle = null;
let dragStartPointer = { x: 0, y: 0 };
let dragStartRect = { x: 0, y: 0, w: 0, h: 0 };
let dragStartImgPoint = { x: 0, y: 0 };

function getPointerCanvasPos(e) {
  const rect = previewCanvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;
  const imgX = screenX / STATE.displayScale;
  const imgY = screenY / STATE.displayScale;
  return { screenX, screenY, imgX, imgY };
}

// 1. Pointer Down
selectionOverlay.addEventListener('pointerdown', e => {
  if (!STATE.workingCanvas) return;
  e.preventDefault();

  const handle = e.target.closest('.handle');
  const isBox = e.target.closest('.selection-box') && !handle;
  const currentRect = STATE.editorMode === 'crop' ? STATE.cropRect : STATE.spectrumRect;
  const pos = getPointerCanvasPos(e);

  dragStartPointer = { x: e.clientX, y: e.clientY };
  dragStartRect    = { ...currentRect };
  dragStartImgPoint= { x: pos.imgX, y: pos.imgY };

  if (handle) {
    dragAction = 'resize';
    dragHandle = handle.dataset.handle;
  } else if (isBox) {
    dragAction = 'move';
    dragHandle = null;
  } else {
    // Clicked outside on mask: start drawing a new rectangular box
    dragAction = 'draw';
    dragHandle = null;
    currentRect.x = Math.max(0, Math.min(STATE.workingCanvas.width - 10, pos.imgX));
    currentRect.y = Math.max(0, Math.min(STATE.workingCanvas.height - 10, pos.imgY));
    currentRect.w = 10;
    currentRect.h = 10;
    updateOverlayUI();
  }

  selectionOverlay.setPointerCapture(e.pointerId);
});

// 2. Pointer Move
selectionOverlay.addEventListener('pointermove', e => {
  if (!dragAction || !STATE.workingCanvas) return;
  e.preventDefault();

  const W = STATE.workingCanvas.width;
  const H = STATE.workingCanvas.height;
  const s = STATE.displayScale;
  const currentRect = STATE.editorMode === 'crop' ? STATE.cropRect : STATE.spectrumRect;
  const pos = getPointerCanvasPos(e);

  if (dragAction === 'move') {
    const dx = (e.clientX - dragStartPointer.x) / s;
    const dy = (e.clientY - dragStartPointer.y) / s;

    let nx = dragStartRect.x + dx;
    let ny = dragStartRect.y + dy;

    // Clamp inside image bounds
    nx = Math.max(0, Math.min(W - dragStartRect.w, nx));
    ny = Math.max(0, Math.min(H - dragStartRect.h, ny));

    currentRect.x = Math.round(nx);
    currentRect.y = Math.round(ny);
  } else if (dragAction === 'resize') {
    const dx = (e.clientX - dragStartPointer.x) / s;
    const dy = (e.clientY - dragStartPointer.y) / s;

    let { x, y, w, h } = dragStartRect;

    switch (dragHandle) {
      case 'br':
        w = Math.max(10, Math.min(W - x, dragStartRect.w + dx));
        h = Math.max(10, Math.min(H - y, dragStartRect.h + dy));
        break;
      case 'bl':
        const nxBl = Math.max(0, Math.min(dragStartRect.x + dragStartRect.w - 10, dragStartRect.x + dx));
        w = (dragStartRect.x + dragStartRect.w) - nxBl;
        x = nxBl;
        h = Math.max(10, Math.min(H - y, dragStartRect.h + dy));
        break;
      case 'tr':
        w = Math.max(10, Math.min(W - x, dragStartRect.w + dx));
        const nyTr = Math.max(0, Math.min(dragStartRect.y + dragStartRect.h - 10, dragStartRect.y + dy));
        h = (dragStartRect.y + dragStartRect.h) - nyTr;
        y = nyTr;
        break;
      case 'tl':
        const nxTl = Math.max(0, Math.min(dragStartRect.x + dragStartRect.w - 10, dragStartRect.x + dx));
        const nyTl = Math.max(0, Math.min(dragStartRect.y + dragStartRect.h - 10, dragStartRect.y + dy));
        w = (dragStartRect.x + dragStartRect.w) - nxTl;
        h = (dragStartRect.y + dragStartRect.h) - nyTl;
        x = nxTl;
        y = nyTl;
        break;
      case 't':
        const nyT = Math.max(0, Math.min(dragStartRect.y + dragStartRect.h - 10, dragStartRect.y + dy));
        h = (dragStartRect.y + dragStartRect.h) - nyT;
        y = nyT;
        break;
      case 'b':
        h = Math.max(10, Math.min(H - y, dragStartRect.h + dy));
        break;
      case 'l':
        const nxL = Math.max(0, Math.min(dragStartRect.x + dragStartRect.w - 10, dragStartRect.x + dx));
        w = (dragStartRect.x + dragStartRect.w) - nxL;
        x = nxL;
        break;
      case 'r':
        w = Math.max(10, Math.min(W - x, dragStartRect.w + dx));
        break;
    }

    currentRect.x = Math.round(x);
    currentRect.y = Math.round(y);
    currentRect.w = Math.round(w);
    currentRect.h = Math.round(h);
  } else if (dragAction === 'draw') {
    const p1x = Math.max(0, Math.min(W, dragStartImgPoint.x));
    const p1y = Math.max(0, Math.min(H, dragStartImgPoint.y));
    const p2x = Math.max(0, Math.min(W, pos.imgX));
    const p2y = Math.max(0, Math.min(H, pos.imgY));

    const x = Math.min(p1x, p2x);
    const y = Math.min(p1y, p2y);
    const w = Math.max(10, Math.abs(p2x - p1x));
    const h = Math.max(10, Math.abs(p2y - p1y));

    currentRect.x = Math.round(x);
    currentRect.y = Math.round(y);
    currentRect.w = Math.round(w);
    currentRect.h = Math.round(h);
  }

  updateOverlayUI();
});

// 3. Pointer Up / Cancel
function endPointerDrag(e) {
  if (!dragAction) return;
  dragAction = null;
  dragHandle = null;

  try {
    selectionOverlay.releasePointerCapture(e.pointerId);
  } catch (_) {}

  // If in spectrum mode and results were previously active, auto-recalculate with zero latency
  if (STATE.editorMode === 'spectrum' && (STATE.analysisResult || STATE.isDemo)) {
    analyseImage(false);
  }
}
selectionOverlay.addEventListener('pointerup', endPointerDrag);
selectionOverlay.addEventListener('pointercancel', endPointerDrag);

/* ── Crop Action Handlers ── */
applyCropBtn.addEventListener('click', applyCrop);
cancelCropBtn.addEventListener('click', cancelCrop);
resetOriginalBtn.addEventListener('click', resetToOriginal);
revertCroppedBtn.addEventListener('click', resetToOriginal);
rotateImageBtn.addEventListener('click', rotateWorkingImage);
resetRegionBtn.addEventListener('click', resetSpectrumRegion);

/**
 * Apply the crop selection: genuinely creates a cropped working canvas.
 * Preserves originalCanvas internally so user can revert anytime.
 */
function applyCrop() {
  if (!STATE.workingCanvas) return;
  const { x, y, w, h } = STATE.cropRect;

  if (w < 10 || h < 10) {
    toast('Crop area is too small. Please select a larger area.', 'warn');
    return;
  }

  const cropped = document.createElement('canvas');
  cropped.width  = Math.round(w);
  cropped.height = Math.round(h);
  const ctx = cropped.getContext('2d');

  // Genuine pixel crop
  ctx.drawImage(
    STATE.workingCanvas,
    Math.round(x), Math.round(y), Math.round(w), Math.round(h),
    0, 0, cropped.width, cropped.height
  );

  STATE.workingCanvas = cropped;
  STATE.imageNaturalW = cropped.width;
  STATE.imageNaturalH = cropped.height;
  STATE.isCropped     = true;

  // Initialize spectrum selection on the new cropped image
  STATE.spectrumRect = {
    x: 0,
    y: Math.round(cropped.height * 0.15),
    w: cropped.width,
    h: Math.round(cropped.height * 0.70),
  };
  STATE.cropRect = {
    x: Math.round(cropped.width * 0.05),
    y: Math.round(cropped.height * 0.05),
    w: Math.round(cropped.width * 0.90),
    h: Math.round(cropped.height * 0.90),
  };

  updatePreviewMeta();
  setEditorMode('spectrum');
  renderPreviewCanvas();
  analyseImage(false);
  toast('Image cropped successfully. Now adjust the spectrum region.', 'success');
}

function cancelCrop() {
  setEditorMode('spectrum');
}

/**
 * Reset working image back to the original uncropped photograph.
 */
function resetToOriginal() {
  if (!STATE.originalCanvas) return;

  const restored = document.createElement('canvas');
  restored.width  = STATE.originalCanvas.width;
  restored.height = STATE.originalCanvas.height;
  restored.getContext('2d').drawImage(STATE.originalCanvas, 0, 0);

  STATE.workingCanvas = restored;
  STATE.imageNaturalW = restored.width;
  STATE.imageNaturalH = restored.height;
  STATE.isCropped     = false;

  initDefaultSelections(restored.width, restored.height);
  updatePreviewMeta();
  setEditorMode('spectrum');
  renderPreviewCanvas();
  analyseImage(false);
  toast('Restored to original uncropped image.', 'info');
}

/**
 * Rotate the working image 90 degrees clockwise (useful for vertical phone photos).
 */
function rotateWorkingImage() {
  if (!STATE.workingCanvas) return;
  const W = STATE.workingCanvas.width;
  const H = STATE.workingCanvas.height;

  const rotCanvas = document.createElement('canvas');
  rotCanvas.width  = H;
  rotCanvas.height = W;
  const ctx = rotCanvas.getContext('2d');

  ctx.translate(H, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(STATE.workingCanvas, 0, 0);

  STATE.workingCanvas = rotCanvas;
  STATE.imageNaturalW = rotCanvas.width;
  STATE.imageNaturalH = rotCanvas.height;

  initDefaultSelections(rotCanvas.width, rotCanvas.height);
  updatePreviewMeta();
  renderPreviewCanvas();
  analyseImage(false);
  toast('Image rotated 90° clockwise.', 'info');
}

function resetSpectrumRegion() {
  if (!STATE.workingCanvas) return;
  const W = STATE.workingCanvas.width;
  const H = STATE.workingCanvas.height;

  STATE.spectrumRect = {
    x: Math.round(W * 0.05),
    y: Math.round(H * 0.25),
    w: Math.round(W * 0.90),
    h: Math.round(H * 0.50),
  };

  updateOverlayUI();
  analyseImage(false);
  toast('Spectrum selection reset to default band.', 'info');
}

function updatePreviewMeta() {
  if (!STATE.workingCanvas) return;
  const filename = STATE.isDemo ? 'demo_cfl_spectrum.png' : (STATE.imageFile ? STATE.imageFile.name : 'spectrum_image.png');
  const cropTag  = STATE.isCropped ? ' · Cropped' : '';
  document.getElementById('previewFilename').textContent = filename;
  document.getElementById('previewMeta').textContent =
    `${STATE.imageNaturalW} × ${STATE.imageNaturalH} px${cropTag}`;
}

function updateWorkflowUI(stepNumber) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`wfStep${i}`);
    if (!el) continue;
    el.classList.remove('active', 'completed');
    if (i < stepNumber) el.classList.add('completed');
    else if (i === stepNumber) el.classList.add('active');
  }
}

function showPreviewPanel(file) {
  uploadZone.style.display  = 'none';
  previewPanel.classList.add('visible');
  updatePreviewMeta();
}

function clearImage() {
  STATE.imageFile      = null;
  STATE.originalCanvas = null;
  STATE.workingCanvas  = null;
  STATE.analysisResult = null;
  STATE.isDemo         = false;
  STATE.isCropped      = false;
  hideDemoBanners();
  previewPanel.classList.remove('visible');
  uploadZone.style.display = '';
  document.getElementById('uploadStatus').textContent = 'No image';
  analyseBtn.disabled = true;
  resetStatCards();
  hideCharts();
  pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  updateWorkflowUI(1);
}

peakThreshRange.addEventListener('input', () => {
  STATE.peakThreshold = +peakThreshRange.value;
  peakThreshVal.textContent = STATE.peakThreshold;
  if (STATE.analysisResult) runPeakDetection();
});

/* ─────────────────────────────────────────────
   CORE IMAGE ANALYSIS
───────────────────────────────────────────── */
analyseBtn.addEventListener('click', () => analyseImage(true));

async function analyseImage(showSuccessToast = true) {
  if (!STATE.workingCanvas && !STATE.isDemo) {
    toast('Please upload an image first.', 'warn');
    return;
  }

  // Validate selection bounds
  const rect = STATE.spectrumRect;
  if (!rect || rect.w < 5 || rect.h < 5) {
    toast('Please select a valid spectrum region of at least 5×5 pixels.', 'warn');
    return;
  }

  analyseBtn.disabled = true;
  analyseBtn.innerHTML = '<div class="spinner"></div> Analysing…';
  await new Promise(r => setTimeout(r, 20));

  try {
    const result = extractPixelData(STATE.workingCanvas, STATE.spectrumRect, STATE.peakThreshold);
    STATE.analysisResult = result;
    STATE.sourceLabel = document.getElementById('sourceLabelInput').value.trim() || (STATE.isDemo ? 'Demo — CFL Lamp (Synthetic)' : 'Experimental Spectrum');
    renderAnalysisResults(result);
    updateWorkflowUI(5);
    if (showSuccessToast) toast('Spectrum analysed successfully.', 'success');
  } catch (e) {
    console.error(e);
    toast('Analysis failed: ' + e.message, 'error');
  }

  analyseBtn.disabled = false;
  analyseBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Analyse Selected Region';
}

/**
 * Core pixel extraction.
 * ONLY reads and averages pixels inside the selected bounding box [x1, y1, selW, selH]!
 * Surrounding background, glare, and CD reflections outside are completely excluded.
 */
function extractPixelData(sourceCanvas, rect, peakThresh) {
  const W = sourceCanvas.width;
  const H = sourceCanvas.height;

  // Accurately clamp coordinates inside working image bounds
  const x1   = Math.max(0, Math.min(W - 1, Math.round(rect.x)));
  const y1   = Math.max(0, Math.min(H - 1, Math.round(rect.y)));
  const selW = Math.max(1, Math.min(W - x1, Math.round(rect.w)));
  const selH = Math.max(1, Math.min(H - y1, Math.round(rect.h)));

  const ctx = sourceCanvas.getContext('2d');
  const imgData = ctx.getImageData(x1, y1, selW, selH);
  const data    = imgData.data;

  const rArr = new Float64Array(selW);
  const gArr = new Float64Array(selW);
  const bArr = new Float64Array(selW);

  // Average channel intensity per horizontal column across the selected height
  for (let col = 0; col < selW; col++) {
    let sumR = 0, sumG = 0, sumB = 0;
    for (let row = 0; row < selH; row++) {
      const idx = (row * selW + col) * 4;
      sumR += data[idx];
      sumG += data[idx + 1];
      sumB += data[idx + 2];
    }
    rArr[col] = sumR / selH;
    gArr[col] = sumG / selH;
    bArr[col] = sumB / selH;
  }

  // Relative luminance Y = 0.2126R + 0.7152G + 0.0722B (ITU-R BT.709)
  const yArr = new Float64Array(selW);
  for (let col = 0; col < selW; col++) {
    yArr[col] = 0.2126 * rArr[col] + 0.7152 * gArr[col] + 0.0722 * bArr[col];
  }

  // Normalise 0–100
  const yMin = Math.min(...yArr);
  const yMax = Math.max(...yArr);
  const yRange = yMax - yMin || 1;
  const normArr = Array.from(yArr).map(v => ((v - yMin) / yRange) * 100);

  // Labels: pixel positions (0 to selW - 1)
  const labels = Array.from({ length: selW }, (_, i) => i);

  // Peak detection
  const peaks = detectPeaks(normArr, peakThresh, PEAK_MIN_SEP);
  const brightestCol = normArr.indexOf(Math.max(...normArr));

  return {
    width: selW,
    regionH: selH,
    selX: x1,
    selY: y1,
    selW,
    selH,
    labels,
    brightness: normArr,
    r: Array.from(rArr),
    g: Array.from(gArr),
    b: Array.from(bArr),
    rawY: Array.from(yArr),
    peaks,
    stats: {
      pixelsAnalysed: selW * selH,
      peakBrightness: Math.max(...normArr).toFixed(1),
      peakCount: peaks.length,
      brightestCol,
      regionW: selW,
      regionH: selH,
    },
  };
}

/**
 * Detect local peaks in the brightness array.
 */
function detectPeaks(arr, thresh, minSep) {
  const n = arr.length;
  const baseline = Math.min(...arr);
  const minHeight = baseline + thresh;
  const candidates = [];

  const WINDOW = 3;
  for (let i = WINDOW; i < n - WINDOW; i++) {
    const v = arr[i];
    if (v < minHeight) continue;
    let isMax = true;
    for (let k = i - WINDOW; k <= i + WINDOW; k++) {
      if (k !== i && arr[k] >= v) { isMax = false; break; }
    }
    if (isMax) candidates.push({ x: i, y: v });
  }

  const peaks = [];
  for (const c of candidates) {
    if (peaks.length === 0 || c.x - peaks[peaks.length - 1].x >= minSep) {
      peaks.push(c);
    } else if (c.y > peaks[peaks.length - 1].y) {
      peaks[peaks.length - 1] = c;
    }
  }
  return peaks;
}

function runPeakDetection() {
  if (!STATE.analysisResult) return;
  const peaks = detectPeaks(STATE.analysisResult.brightness, STATE.peakThreshold, PEAK_MIN_SEP);
  STATE.analysisResult.peaks = peaks;
  STATE.analysisResult.stats.peakCount = peaks.length;
  renderBrightnessChart(STATE.analysisResult);
  updateStatCards(STATE.analysisResult.stats);
}

/* ─────────────────────────────────────────────
   RENDER RESULTS
───────────────────────────────────────────── */
function renderAnalysisResults(result) {
  updateStatCards(result.stats);
  renderBrightnessChart(result);
  renderRGBChart(result);
  updateResultsView(result);
  enableDownloadBtns();
  // Sync calibration
  if (STATE.calibEq) renderCalibratedChart(result);
}

function updateStatCards(stats) {
  document.getElementById('statPixels').textContent       = stats.pixelsAnalysed.toLocaleString();
  document.getElementById('statPeakBrightness').textContent = `${stats.peakBrightness}`;
  document.getElementById('statPeaks').textContent        = stats.peakCount;
  document.getElementById('statBrightestCol').textContent = stats.brightestCol;
  document.getElementById('statRegion').textContent       = `${stats.regionW} × ${stats.regionH}`;
}

function resetStatCards() {
  ['statPixels','statPeakBrightness','statPeaks','statBrightestCol','statRegion']
    .forEach(id => document.getElementById(id).textContent = '—');
}

function enableDownloadBtns() {
  document.getElementById('downloadBrightnessChart').disabled = false;
  document.getElementById('downloadRGBChart').disabled = false;
}

function hideCharts() {
  ['emptyBrightness','emptyRGB'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  });
  document.getElementById('brightnessChart').style.display = 'none';
  document.getElementById('rgbChart').style.display = 'none';
  document.getElementById('downloadBrightnessChart').disabled = true;
  document.getElementById('downloadRGBChart').disabled = true;
}

/* ─────────────────────────────────────────────
   CHARTS
───────────────────────────────────────────── */
function destroyChart(key) {
  if (STATE.charts[key]) {
    STATE.charts[key].destroy();
    STATE.charts[key] = null;
  }
}

function buildChartOptions(xLabel, yLabel, yMax) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#141928',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        padding: 9,
        titleColor: '#e8eaf0',
        bodyColor: '#8892a4',
        callbacks: {
          title: ctx => `Pixel x = ${ctx[0].label}`,
        }
      },
    },
    scales: {
      x: {
        title: { display: true, text: xLabel, color: '#8892a4' },
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { maxTicksLimit: 16, color: '#4a5568' },
      },
      y: {
        title: { display: true, text: yLabel, color: '#8892a4' },
        grid: { color: 'rgba(255,255,255,0.05)' },
        min: 0,
        max: yMax,
      }
    }
  };
}

function renderBrightnessChart(result) {
  const canvasEl = document.getElementById('brightnessChart');
  document.getElementById('emptyBrightness').style.display = 'none';
  canvasEl.style.display = 'block';

  destroyChart('brightness');

  // Downsample for performance if very wide image
  const { labels, brightness } = downsample(result.labels, result.brightness, 800);

  // Map peaks to closest downsampled labels for seamless category axis alignment
  const stepRatio = result.labels.length / labels.length;
  const peakData = labels.map(lbl => {
    const p = result.peaks.find(pk => Math.abs(pk.x - lbl) <= Math.max(1, stepRatio * 0.7));
    return p ? p.y : null;
  });

  STATE.charts.brightness = new Chart(canvasEl, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Relative Brightness (Y)',
          data: brightness,
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167,139,250,0.08)',
          fill: true,
          order: 1,
        },
        {
          label: 'Detected Peaks',
          data: peakData,
          borderColor: '#f59e0b',
          backgroundColor: '#f59e0b',
          pointRadius: 6,
          pointHoverRadius: 8,
          pointStyle: 'triangle',
          showLine: false,
          order: 0,
        }
      ],
    },
    options: buildChartOptions('Pixel Position (x)', 'Relative Brightness (0–100)', 105),
  });
}

function renderRGBChart(result) {
  const canvasEl = document.getElementById('rgbChart');
  document.getElementById('emptyRGB').style.display = 'none';
  canvasEl.style.display = 'block';

  destroyChart('rgb');

  const { labels, brightness: r } = downsample(result.labels, result.r, 800);
  const { brightness: g } = downsample(result.labels, result.g, 800);
  const { brightness: b } = downsample(result.labels, result.b, 800);

  STATE.charts.rgb = new Chart(canvasEl, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Red channel',   data: r, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.06)',   fill: false },
        { label: 'Green channel', data: g, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.06)',   fill: false },
        { label: 'Blue channel',  data: b, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.06)',  fill: false },
      ],
    },
    options: buildChartOptions('Pixel Position (x)', 'Average Channel Intensity (0–255)', 265),
  });
}

function renderCalibratedChart(result) {
  if (!STATE.calibEq || !result) return;
  const { a, b } = STATE.calibEq;

  const wrapper = document.getElementById('calibChartWrapper');
  wrapper.style.display = 'block';
  const canvasEl = document.getElementById('calibChart');

  destroyChart('calib');

  const { labels, brightness } = downsample(result.labels, result.brightness, 800);
  const wlLabels = labels.map(x => (a * x + b).toFixed(1));

  STATE.charts.calib = new Chart(canvasEl, {
    type: 'line',
    data: {
      labels: wlLabels,
      datasets: [{
        label: `${STATE.sourceLabel} — Calibrated`,
        data: brightness,
        borderColor: '#22d3ee',
        backgroundColor: 'rgba(34,211,238,0.07)',
        fill: true,
      }],
    },
    options: buildChartOptions('Wavelength (nm)', 'Relative Brightness (0–100)', 105),
  });

  document.getElementById('downloadCalibChart').disabled = false;
}

/** Downsample arrays to maxPoints for rendering performance */
function downsample(labels, values, maxPoints) {
  if (labels.length <= maxPoints) return { labels: [...labels], brightness: [...values] };
  const step = labels.length / maxPoints;
  const lOut = [], vOut = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    lOut.push(labels[idx]);
    vOut.push(+values[idx].toFixed(2));
  }
  return { labels: lOut, brightness: vOut };
}

/* ─────────────────────────────────────────────
   RESULTS VIEW
───────────────────────────────────────────── */
function updateResultsView(result) {
  document.getElementById('noResultsCard').style.display = 'none';
  document.getElementById('resultsPanel').style.display  = 'block';

  // Thumbnail
  const thumb = document.getElementById('resultThumb');
  const src = STATE.workingCanvas || STATE.originalCanvas || STATE.imageBitmap;
  if (thumb && src) {
    const sw = src.width || STATE.imageNaturalW || 300;
    const sh = src.height || STATE.imageNaturalH || 150;
    const scale = Math.min(260 / sw, 150 / sh, 1);
    thumb.width  = Math.max(1, Math.round(sw * scale));
    thumb.height = Math.max(1, Math.round(sh * scale));
    const ctx = thumb.getContext('2d');
    ctx.drawImage(src, 0, 0, thumb.width, thumb.height);
    if (STATE.spectrumRect) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        STATE.spectrumRect.x * scale,
        STATE.spectrumRect.y * scale,
        STATE.spectrumRect.w * scale,
        STATE.spectrumRect.h * scale
      );
    }
  }

  document.getElementById('resultSourceLabel').textContent = STATE.sourceLabel || 'Unknown Source';
  document.getElementById('resultCalibStatus').innerHTML = STATE.calibEq
    ? '<span class="badge badge-green">Calibrated</span>'
    : '<span class="badge badge-amber">Uncalibrated (pixel position only)</span>';

  // Summary rows
  document.getElementById('rPixels').textContent       = `${result.stats.pixelsAnalysed.toLocaleString()} pixels analysed (${result.stats.regionW} columns × ${result.stats.regionH} rows)`;
  document.getElementById('rPeakBrightness').textContent = `Peak relative brightness: ${result.stats.peakBrightness} / 100`;
  document.getElementById('rPeaks').textContent        = `${result.stats.peakCount} brightness peak${result.stats.peakCount !== 1 ? 's' : ''} detected`;
  document.getElementById('rRegion').textContent       = `Selected region: ${result.stats.regionW} × ${result.stats.regionH} px`;

  // Demo banner
  if (STATE.isDemo) {
    document.getElementById('demoBannerResults').classList.add('visible');
  } else {
    document.getElementById('demoBannerResults').classList.remove('visible');
  }

  // Auto observations
  generateObservations(result);
}

function generateObservations(result) {
  const obs = [];
  const s = result.stats;
  const br = result.brightness;

  obs.push(`The analysis covered <strong>${s.pixelsAnalysed.toLocaleString()} pixels</strong> across ${s.regionW} horizontal columns and ${s.regionH} rows.`);

  const mean = br.reduce((a,b) => a+b, 0) / br.length;
  obs.push(`Mean relative brightness across the selected region: <strong>${mean.toFixed(1)} / 100</strong>.`);

  if (s.peakCount === 0) {
    obs.push('No distinct brightness peaks were detected above the current threshold. Try lowering the peak threshold or adjusting the selected region to capture the spectral band.');
  } else {
    obs.push(`<strong>${s.peakCount} peak${s.peakCount !== 1 ? 's' : ''}</strong> detected above the threshold. Peak positions: ${result.peaks.map(p => `x=${p.x} (br=${p.y.toFixed(1)})`).join(', ')}.`);
  }

  obs.push(`Brightest column is at pixel position <strong>x = ${s.brightestCol}</strong> with normalised brightness 100. Without calibration, the pixel position does not directly correspond to a specific wavelength.`);

  // Dominant channel
  const maxR = Math.max(...result.r);
  const maxG = Math.max(...result.g);
  const maxB = Math.max(...result.b);
  const domChannel = maxR >= maxG && maxR >= maxB ? 'red' : maxG >= maxR && maxG >= maxB ? 'green' : 'blue';
  obs.push(`The dominant colour channel by maximum intensity is <strong>${domChannel}</strong> (R_max=${maxR.toFixed(0)}, G_max=${maxG.toFixed(0)}, B_max=${maxB.toFixed(0)}), reflecting the colour balance of the source light and camera response.`);

  if (!STATE.calibEq) {
    obs.push('Wavelength calibration has not been applied. All positions are in pixel units. Enter calibration reference points to convert to nanometres.');
  } else {
    const { a, b } = STATE.calibEq;
    const wlBright = a * s.brightestCol + b;
    obs.push(`With the current calibration (λ = ${a.toFixed(3)}·x + ${b.toFixed(1)} nm), the brightest peak corresponds to approximately <strong>${wlBright.toFixed(1)} nm</strong>. Calibration accuracy depends on the quality of reference point selection.`);
  }

  if (STATE.isDemo) {
    obs.push('<em>Note: This is illustrative demo data. These observations describe synthetic values, not a real experimental measurement.</em>');
  }

  const list = document.getElementById('observationsList');
  list.innerHTML = obs.map(o => `<div class="obs-item"><div class="obs-dot"></div><span>${o}</span></div>`).join('');
}

/* ─────────────────────────────────────────────
   CALIBRATION
───────────────────────────────────────────── */
document.getElementById('addCalibRow').addEventListener('click', addCalibRow);
document.getElementById('applyCalibBtn').addEventListener('click', applyCalibration);
document.getElementById('clearCalibBtn').addEventListener('click', clearCalibration);
document.getElementById('downloadCalibChart').addEventListener('click', () => downloadChart('calib', 'calibrated_spectrum.png'));

let calibRowCount = 2;

function addCalibRow() {
  calibRowCount++;
  const container = document.getElementById('calibInputs');
  const row = document.createElement('div');
  row.className = 'calib-row';
  row.dataset.row = calibRowCount;
  row.innerHTML = `
    <input class="form-input calib-px" type="number" placeholder="Pixel position" min="0" />
    <input class="form-input calib-wl" type="number" placeholder="Wavelength (nm)" min="380" max="750" />
    <button class="btn btn-ghost btn-sm btn-icon calib-remove-btn" title="Remove" onclick="this.closest('.calib-row').remove()">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;
  container.appendChild(row);
}

function applyCalibration() {
  const rows = document.querySelectorAll('#calibInputs .calib-row');
  const points = [];

  rows.forEach(row => {
    const px = parseFloat(row.querySelector('.calib-px').value);
    const wl = parseFloat(row.querySelector('.calib-wl').value);
    if (!isNaN(px) && !isNaN(wl) && px >= 0 && wl >= 380 && wl <= 750) {
      points.push({ px, wl });
    }
  });

  const statusEl = document.getElementById('calibStatus');

  if (points.length < 2) {
    statusEl.className = 'calib-status visible error';
    statusEl.textContent = 'Please provide at least 2 valid calibration points. Wavelengths must be between 380 and 750 nm.';
    return;
  }

  // Check for duplicate pixel values
  const pxVals = points.map(p => p.px);
  if (new Set(pxVals).size !== pxVals.length) {
    statusEl.className = 'calib-status visible error';
    statusEl.textContent = 'Two calibration points have the same pixel position. Each pixel position must be unique.';
    return;
  }

  // Linear regression (least squares)
  const n  = points.length;
  const sumX  = points.reduce((s, p) => s + p.px, 0);
  const sumY  = points.reduce((s, p) => s + p.wl, 0);
  const sumXY = points.reduce((s, p) => s + p.px * p.wl, 0);
  const sumX2 = points.reduce((s, p) => s + p.px * p.px, 0);
  const denom = n * sumX2 - sumX * sumX;

  if (Math.abs(denom) < 1e-9) {
    statusEl.className = 'calib-status visible error';
    statusEl.textContent = 'Calibration failed: pixel positions are too similar to fit a line.';
    return;
  }

  const a = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - a * sumX) / n;

  STATE.calibEq = { a, b };
  STATE.calibPoints = points;

  // R² for quality check
  const yMean = sumY / n;
  const ssTot = points.reduce((s, p) => s + (p.wl - yMean) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.wl - (a * p.px + b)) ** 2, 0);
  const r2 = 1 - ssRes / (ssTot || 1);

  const eqStr = `λ = ${a.toFixed(4)}·x + ${b.toFixed(2)} nm`;
  document.getElementById('calibEquationDisplay').textContent = `Fitted equation: ${eqStr} | R² = ${r2.toFixed(4)}`;

  let statusMsg = `✓ Calibration applied with ${n} point${n > 1 ? 's' : ''}.\nEquation: ${eqStr}\nR² = ${r2.toFixed(4)} (${r2 > 0.99 ? 'excellent' : r2 > 0.95 ? 'good' : 'poor — check reference points'} fit).`;
  if (r2 < 0.95) {
    statusMsg += '\n⚠ Low R² may indicate non-linear dispersion. CD/DVD gratings can produce curved spectra.';
  }
  statusEl.className = 'calib-status visible';
  statusEl.textContent = statusMsg;

  toast(`Calibration applied. R² = ${r2.toFixed(3)}`, r2 > 0.95 ? 'success' : 'warn');

  if (STATE.analysisResult) {
    renderCalibratedChart(STATE.analysisResult);
    updateResultsView(STATE.analysisResult);
  }
}

function clearCalibration() {
  STATE.calibEq = null;
  STATE.calibPoints = [];
  document.getElementById('calibStatus').className = 'calib-status';
  document.getElementById('calibEquationDisplay').textContent = '';
  document.getElementById('calibChartWrapper').style.display = 'none';
  destroyChart('calib');
  if (STATE.analysisResult) updateResultsView(STATE.analysisResult);
  toast('Calibration cleared.', 'info');
}

/* ─────────────────────────────────────────────
   COMPARE VIEW
───────────────────────────────────────────── */
function initCompareSlot(slotKey, uploadId, fileInputId, previewId, controlsId, metaId, topId, topValId, heightId, heightValId) {
  const uploadEl   = document.getElementById(uploadId);
  const fileInputEl= document.getElementById(fileInputId);
  const previewEl  = document.getElementById(previewId);
  const controlsEl = document.getElementById(controlsId);
  const metaEl     = document.getElementById(metaId);
  const topEl      = document.getElementById(topId);
  const topValEl   = document.getElementById(topValId);
  const heightEl   = document.getElementById(heightId);
  const heightValEl= document.getElementById(heightValId);

  uploadEl.addEventListener('click', () => fileInputEl.click());
  fileInputEl.addEventListener('change', async () => {
    const f = fileInputEl.files[0];
    if (!f) return;
    const err = validateFile(f);
    if (err) { toast(err, 'error'); return; }

    try {
      const bitmap = await createImageBitmap(f);
      STATE[slotKey].file   = f;
      STATE[slotKey].bitmap = bitmap;
      STATE[slotKey].w      = bitmap.width;
      STATE[slotKey].h      = bitmap.height;
      STATE[slotKey].result = null;

      // Draw mini preview
      const maxW = 260, maxH = 120;
      const s = Math.min(maxW / bitmap.width, maxH / bitmap.height, 1);
      previewEl.width  = Math.round(bitmap.width  * s);
      previewEl.height = Math.round(bitmap.height * s);
      previewEl.getContext('2d').drawImage(bitmap, 0, 0, previewEl.width, previewEl.height);
      previewEl.style.display = 'block';

      metaEl.textContent = `${bitmap.width} × ${bitmap.height} px · ${f.name}`;
      controlsEl.style.display = 'block';
      uploadEl.style.display = 'none';

      checkCompareReady();
      toast(`${slotKey === 'compareA' ? 'Source A' : 'Source B'} loaded.`, 'success');
    } catch (e) {
      toast('Could not read image.', 'error');
    }
    fileInputEl.value = '';
  });

  topEl.addEventListener('input', () => {
    STATE[slotKey].selTop = +topEl.value;
    topValEl.textContent = STATE[slotKey].selTop + '%';
  });
  heightEl.addEventListener('input', () => {
    STATE[slotKey].selHeight = +heightEl.value;
    heightValEl.textContent = STATE[slotKey].selHeight + '%';
  });
}

initCompareSlot('compareA', 'uploadA', 'fileInputA', 'previewA', 'controlsA', 'metaA',
  'selTopA', 'selTopAVal', 'selHeightA', 'selHeightAVal');
initCompareSlot('compareB', 'uploadB', 'fileInputB', 'previewB', 'controlsB', 'metaB',
  'selTopB', 'selTopBVal', 'selHeightB', 'selHeightBVal');

function checkCompareReady() {
  const ready = STATE.compareA.bitmap && STATE.compareB.bitmap;
  document.getElementById('compareBtn').disabled = !ready;
}

document.getElementById('compareBtn').addEventListener('click', async () => {
  const btn = document.getElementById('compareBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Comparing…';
  await new Promise(r => setTimeout(r, 30));

  try {
    STATE.compareA.result = extractPixelData(STATE.compareA.bitmap, STATE.compareA.selTop, STATE.compareA.selHeight, STATE.peakThreshold);
    STATE.compareB.result = extractPixelData(STATE.compareB.bitmap, STATE.compareB.selTop, STATE.compareB.selHeight, STATE.peakThreshold);

    renderCompareChart();
    toast('Comparison complete.', 'success');
  } catch (e) {
    toast('Comparison failed: ' + e.message, 'error');
  }

  btn.disabled = false;
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Compare Spectra';
});

function renderCompareChart() {
  const a = STATE.compareA.result;
  const b = STATE.compareB.result;
  const labelA = document.getElementById('sourceAName').value || 'Source A';
  const labelB = document.getElementById('sourceBName').value || 'Source B';

  document.getElementById('compareChartCard').style.display = 'block';

  // Normalise both to same length via downsampling
  const TARGET = 600;
  const { labels: lA, brightness: bA } = downsample(a.labels, a.brightness, TARGET);
  const { brightness: bB } = downsample(b.labels, b.brightness, TARGET);

  // Warn if image widths differ
  if (Math.abs(a.width - b.width) > 50) {
    toast('Warning: the two images have different widths. Comparison uses pixel position in each image independently.', 'warn', 5000);
  }

  destroyChart('compare');
  const canvasEl = document.getElementById('compareChart');

  STATE.charts.compare = new Chart(canvasEl, {
    type: 'line',
    data: {
      labels: lA,
      datasets: [
        {
          label: labelA,
          data: bA,
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167,139,250,0.08)',
          fill: false,
        },
        {
          label: labelB,
          data: bB,
          borderColor: '#22d3ee',
          backgroundColor: 'rgba(34,211,238,0.08)',
          fill: false,
        },
      ],
    },
    options: buildChartOptions('Pixel Position (x)', 'Relative Brightness (0–100)', 105),
  });

  renderCompareSummary(a, b, labelA, labelB);
  document.getElementById('downloadCompareChart').addEventListener('click', () => downloadChart('compare', 'comparison_spectra.png'));
}

function renderCompareSummary(a, b, labelA, labelB) {
  const summary = document.getElementById('compareSummary');
  const text    = document.getElementById('compareSummaryText');
  summary.style.display = 'block';

  const meanA = (a.brightness.reduce((s,v) => s+v, 0) / a.brightness.length).toFixed(1);
  const meanB = (b.brightness.reduce((s,v) => s+v, 0) / b.brightness.length).toFixed(1);
  const peakA = a.stats.peakBrightness;
  const peakB = b.stats.peakBrightness;
  const pkA   = a.peaks.length;
  const pkB   = b.peaks.length;

  let html = `
    <p><strong>${labelA}</strong>: mean brightness ${meanA}/100, peak ${peakA}/100, ${pkA} peak${pkA !== 1 ? 's' : ''} detected.</p>
    <p><strong>${labelB}</strong>: mean brightness ${meanB}/100, peak ${peakB}/100, ${pkB} peak${pkB !== 1 ? 's' : ''} detected.</p>
    <p style="margin-top:8px;color:var(--text-muted);">`;

  if (Math.abs(a.width - b.width) > 50) {
    html += `⚠ The two images have different widths (${a.width} vs ${b.width} px). The x-axis represents pixel position <em>within each image</em>, not a shared physical coordinate. Horizontal alignment is approximate.<br/>`;
  }
  html += `These results reflect measured image brightness in the selected region. Differences may arise from exposure, camera settings, framing geometry, or real differences in spectral composition. Do not interpret brightness differences as absolute light intensity differences without controlled photometric conditions.`;
  html += '</p>';

  text.innerHTML = html;
}

/* ─────────────────────────────────────────────
   EXPORT — CSV
───────────────────────────────────────────── */
document.getElementById('exportCSVBtn').addEventListener('click', exportCSV);
document.getElementById('exportBrightnessBtn').addEventListener('click', () => downloadChart('brightness', 'brightness_profile.png'));
document.getElementById('exportRGBBtn').addEventListener('click', () => downloadChart('rgb', 'rgb_channels.png'));
document.getElementById('printReportBtn').addEventListener('click', () => window.print());

document.getElementById('downloadBrightnessChart').addEventListener('click', () => downloadChart('brightness', 'brightness_profile.png'));
document.getElementById('downloadRGBChart').addEventListener('click', () => downloadChart('rgb', 'rgb_channels.png'));

function exportCSV() {
  const result = STATE.analysisResult;
  if (!result) { toast('No analysis results to export.', 'warn'); return; }

  const rows = ['pixel_x,red_avg,green_avg,blue_avg,luminance_y,brightness_norm'];
  for (let x = 0; x < result.width; x++) {
    const wl = STATE.calibEq ? `,${(STATE.calibEq.a * x + STATE.calibEq.b).toFixed(2)}` : '';
    rows.push(`${x},${result.r[x].toFixed(2)},${result.g[x].toFixed(2)},${result.b[x].toFixed(2)},${result.rawY[x].toFixed(2)},${result.brightness[x].toFixed(2)}${wl}`);
  }

  if (STATE.calibEq) {
    rows[0] += ',wavelength_nm';
  }

  const header = [
    `# SPECTRA LAB — Analysis Results`,
    `# Source: ${STATE.sourceLabel || 'Unknown'}`,
    `# Date: ${new Date().toISOString()}`,
    `# Region: y=${result.selY1} to y=${result.selY2} (height ${result.regionH} px)`,
    `# Luminance formula: Y = 0.2126*R + 0.7152*G + 0.0722*B`,
    `# brightness_norm: Y normalised to 0-100`,
    `# ${STATE.isDemo ? 'WARNING: ILLUSTRATIVE DEMO DATA — NOT A REAL MEASUREMENT' : 'Real experimental data'}`,
    '',
  ].join('\n');

  const blob = new Blob([header + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, 'spectra_lab_data.csv');
  toast('CSV downloaded.', 'success');
}

function downloadChart(key, filename) {
  const chart = STATE.charts[key];
  if (!chart) { toast('Chart not available.', 'warn'); return; }
  const url = chart.toBase64Image('image/png', 1);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  toast(`${filename} downloaded.`, 'success');
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────
   DEMO MODE & OVERVIEW NAVIGATION
───────────────────────────────────────────── */
document.getElementById('demoBtn')?.addEventListener('click', () => {
  loadDemoData();
  switchView('analysis');
});

document.getElementById('exploreBtn')?.addEventListener('click', () => {
  loadDemoData();
  switchView('analysis');
});

document.getElementById('startAnalysisBtn')?.addEventListener('click', () => {
  switchView('analysis');
});

document.getElementById('exitDemoBtn')?.addEventListener('click', () => {
  clearImage();
  hideDemoBanners();
  STATE.isDemo = false;
  toast('Exited demo mode. Upload a real photograph to begin your experiment.', 'info');
});

function hideDemoBanners() {
  document.getElementById('demoBannerAnalysis')?.classList.remove('visible');
  document.getElementById('demoBannerResults')?.classList.remove('visible');
}

/**
 * Generates an illustrative synthetic CFL spectrum image onto a canvas.
 * Simulates the dispersion of fluorescent tube emission through a CD grating.
 */
function createDemoSpectrumCanvas() {
  const w = 800;
  const h = 260;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  // Dark spectroscope slit interior background
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, w, h);

  // Background subtle noise / cardboard interior texture
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = Math.floor(Math.random() * 8);
    data[i] = Math.min(255, data[i] + noise);
    data[i + 1] = Math.min(255, data[i + 1] + noise);
    data[i + 2] = Math.min(255, data[i + 2] + noise);
  }
  ctx.putImageData(imgData, 0, 0);

  // Render rainbow spectrum band in middle (y = 50 to 210)
  const bandY1 = 50;
  const bandY2 = 210;
  const bandH = bandY2 - bandY1;

  for (let x = 0; x < w; x++) {
    const norm = x / w; // 0 (violet) to 1 (red)
    let r = 0, g = 0, b = 0;

    // Continuous baseline rainbow
    if (norm < 0.2) {
      const t = norm / 0.2;
      r = Math.round(90 * (1 - t) + 20 * t);
      g = Math.round(10 * (1 - t) + 40 * t);
      b = Math.round(180 * (1 - t) + 240 * t);
    } else if (norm < 0.4) {
      const t = (norm - 0.2) / 0.2;
      r = Math.round(20 * (1 - t) + 10 * t);
      g = Math.round(40 * (1 - t) + 200 * t);
      b = Math.round(240 * (1 - t) + 220 * t);
    } else if (norm < 0.6) {
      const t = (norm - 0.4) / 0.2;
      r = Math.round(10 * (1 - t) + 180 * t);
      g = Math.round(200 * (1 - t) + 240 * t);
      b = Math.round(220 * (1 - t) + 20 * t);
    } else if (norm < 0.8) {
      const t = (norm - 0.6) / 0.2;
      r = Math.round(180 * (1 - t) + 245 * t);
      g = Math.round(240 * (1 - t) + 120 * t);
      b = Math.round(20 * (1 - t) + 10 * t);
    } else {
      const t = (norm - 0.8) / 0.2;
      r = Math.round(245 * (1 - t) + 190 * t);
      g = Math.round(120 * (1 - t) + 15 * t);
      b = Math.round(10 * (1 - t) + 10 * t);
    }

    // Discrete CFL emission peaks:
    // Hg 404.7nm (norm ~0.10), Hg 435.8nm (norm ~0.22), Hg 546.1nm (norm ~0.52),
    // Hg 577/579nm (norm ~0.66), Phosphor Eu:Y2O3 611nm (norm ~0.80)
    const lines = [
      { center: 0.10, width: 0.015, boostR: 120, boostG: 40,  boostB: 240 },
      { center: 0.22, width: 0.012, boostR: 40,  boostG: 120, boostB: 255 },
      { center: 0.52, width: 0.018, boostR: 80,  boostG: 255, boostB: 60  },
      { center: 0.66, width: 0.012, boostR: 255, boostG: 230, boostB: 40  },
      { center: 0.80, width: 0.020, boostR: 255, boostG: 60,  boostB: 40  },
    ];

    lines.forEach(l => {
      const dist = Math.abs(norm - l.center) / l.width;
      if (dist < 3) {
        const factor = Math.exp(-0.5 * dist * dist);
        r = Math.min(255, r + l.boostR * factor);
        g = Math.min(255, g + l.boostG * factor);
        b = Math.min(255, b + l.boostB * factor);
      }
    });

    // Vertical slit beam envelope
    for (let y = bandY1; y < bandY2; y++) {
      const yNorm = (y - (bandY1 + bandH / 2)) / (bandH / 2);
      const intensity = Math.max(0, 1 - yNorm * yNorm * 0.9);
      ctx.fillStyle = `rgb(${Math.round(r * intensity)}, ${Math.round(g * intensity)}, ${Math.round(b * intensity)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Visual label inside demo image to ensure 100% clarity
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '11px JetBrains Mono, monospace';
  ctx.fillText('ILLUSTRATIVE DEMO SPECTRUM — SYNTHETIC CFL LAMP', 20, 32);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.font = '10px Inter, sans-serif';
  ctx.fillText('Hg 405nm', 65, bandY2 + 25);
  ctx.fillText('Hg 436nm', 160, bandY2 + 25);
  ctx.fillText('Hg 546nm', 400, bandY2 + 25);
  ctx.fillText('Hg 579nm', 510, bandY2 + 25);
  ctx.fillText('Phosphor 611nm', 620, bandY2 + 25);

  return c;
}

function loadDemoData() {
  STATE.isDemo = true;
  STATE.sourceLabel = 'Demo — CFL Lamp (Synthetic)';
  STATE.imageBitmap = null;
  STATE.imageFile = null;
  STATE.isCropped = false;

  const demoCanvas = createDemoSpectrumCanvas();
  STATE.originalCanvas = demoCanvas;
  STATE.workingCanvas = demoCanvas;
  STATE.imageNaturalW = demoCanvas.width;
  STATE.imageNaturalH = demoCanvas.height;

  // Initialize selection regions: default spectrum region over the rainbow band
  STATE.spectrumRect = {
    x: 40,
    y: 50,
    w: 720,
    h: 160
  };
  STATE.cropRect = {
    x: 10,
    y: 20,
    w: 780,
    h: 220
  };

  // Show banners and interactive editor panel
  document.getElementById('demoBannerAnalysis')?.classList.add('visible');
  previewPanel.classList.add('visible');
  uploadZone.style.display = 'none';
  document.getElementById('uploadStatus').textContent = 'Demo Active';

  setEditorMode('spectrum');
  renderPreviewCanvas();
  updateOverlayUI();
  updateCoordDisplay();
  setWorkflowStep(4);

  // Run analysis directly on the demo image pixels
  analyseImage(false);

  toast('Demo mode active: Loaded illustrative CFL spectrum. This is synthetic data, not an experimental measurement.', 'info', 6000);
}

/* ─────────────────────────────────────────────
   MAKE switchView global (used in HTML onclick)
───────────────────────────────────────────── */
window.switchView = switchView;

/* ─────────────────────────────────────────────
   RESIZE: re-render preview canvas on window resize
───────────────────────────────────────────── */
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (STATE.workingCanvas || STATE.originalCanvas || STATE.imageBitmap) {
      renderPreviewCanvas();
      updateOverlayUI();
    }
  }, 250);
});

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
(function init() {
  // Ensure we start on overview
  switchView('overview');
  console.log('SPECTRA LAB initialised. All image processing is local — no data is sent to any server.');
})();
