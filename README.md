# SPECTRA LAB
## DIY Spectroscope & Light Spectrum Analyser

> A complete, browser-based scientific tool for analysing photographs taken through a homemade CD/DVD spectroscope.  
> Built for a first-year engineering physics lab demonstration.

---

## Quick Start (Windows)

### Option 1 — Python (recommended, no install required on most Windows machines)

```powershell
# In the project folder:
python -m http.server 8080
# Then open:  http://localhost:8080
```

### Option 2 — Node.js (if installed)

```powershell
npx -y serve .
# Or:
npx -y http-server . -p 8080
```

### Option 3 — VS Code Live Server

1. Open the folder in VS Code
2. Install the **Live Server** extension
3. Right-click `index.html` → **Open with Live Server**

> **Important:** The app must be served over HTTP (not opened as `file://`) because `createImageBitmap` and `OffscreenCanvas` require a proper HTTP context in some browsers.

---

## Features — Implemented & Tested

| Feature | Status |
|---|---|
| Upload JPG/JPEG/PNG via drag-and-drop or browse | ✅ |
| Interactive Image Cropping tool (8 draggable handles, genuine pixel crop, undo/reset) | ✅ |
| 2D Spectrum Region Selection tool (click-drag box, 8 handles, live coordinates) | ✅ |
| Real pixel-level analysis strictly within selected region | ✅ |
| Luminance formula Y = 0.2126R + 0.7152G + 0.0722B | ✅ |
| Brightness profile chart (Chart.js) with peak detection | ✅ |
| RGB channel analysis chart | ✅ |
| Peak detection with adjustable threshold & prominent markers | ✅ |
| Analysis stat cards (pixels, peaks, brightest column, region size) | ✅ |
| Optional Wavelength calibration (linear regression, ≥2 points) | ✅ |
| Calibrated spectrum chart (λ in nm) | ✅ |
| Two-source comparison with overlay chart | ✅ |
| Auto-generated observations from actual experimental data | ✅ |
| Download CSV (real pixel data) | ✅ |
| Download charts as PNG | ✅ |
| Print-friendly lab report | ✅ |
| Explore Demo mode (synthetic CFL spectrum, clearly separated) | ✅ |
| Comprehensive Physics & Diffraction Theory section | ✅ |
| Responsive layout (desktop, laptop, tablet, mobile) | ✅ |
| Dark scientific dashboard UI | ✅ |
| Fully local processing in browser (100% private, zero uploads) | ✅ |
| Static-site deployable (Vercel / GitHub Pages) | ✅ |

---

## Deployment

### Vercel (recommended)

```bash
# Install Vercel CLI once
npm i -g vercel

# In the project folder:
vercel
```

Or simply drag and drop the folder to [vercel.com/new](https://vercel.com/new).

### GitHub Pages

1. Create a GitHub repository
2. Push all four files (`index.html`, `styles.css`, `app.js`, `README.md`)
3. Go to **Settings → Pages → Source → main branch / root**
4. Your site is live at `https://<username>.github.io/<repo>/`

No build step is required — the project is a pure static site.

---

## How the Analysis Works

1. **Image loading** — The photograph is decoded into an `ImageBitmap` via `createImageBitmap()`.
2. **Region selection** — The user selects a horizontal band (adjustable top % and height %) representing the spectrum.
3. **Pixel extraction** — An `OffscreenCanvas` copies the bitmap and `getImageData()` reads every pixel in the selected region.
4. **Channel averaging** — For each vertical column `x`, the red, green, and blue values are averaged across all rows in the band.
5. **Luminance** — `Y(x) = 0.2126·R(x) + 0.7152·G(x) + 0.0722·B(x)` (ITU-R BT.709).
6. **Normalisation** — Y values are scaled to 0–100.
7. **Peak detection** — Local maxima above a minimum prominence threshold, separated by ≥8 columns, are marked.
8. **Calibration** (optional) — Linear regression on user-provided pixel→wavelength reference points gives `λ = a·x + b`.

---

## Scientific Honesty

- Results show **relative image brightness**, not absolute optical intensity.
- Pixel positions are **not wavelengths** without explicit calibration.
- Camera response, exposure, and JPEG compression all affect channel values.
- CD/DVD groove geometry may produce **non-linear dispersion**.
- Demo data is always clearly labelled as synthetic.

---

## File Structure

```
spectroscope/
├── index.html     ← All HTML views and structure
├── styles.css     ← Complete dark dashboard CSS
├── app.js         ← All JavaScript (analysis, charts, export)
└── README.md      ← This file
```

---

## Lab Demonstration Checklist

- [ ] Open the website in Chrome or Edge (`http://localhost:8080`)
- [ ] On the Overview page, click **Explore Demo**
- [ ] Notice automatic navigation to Spectrum Analysis with the illustrative synthetic CFL spectrum loaded
- [ ] Point out the clearly visible "ILLUSTRATIVE DEMO DATA — NOT A REAL EXPERIMENTAL MEASUREMENT" notices
- [ ] Demonstrate the **Crop Image** tool: draw selection, drag resize handles, click **Apply Crop**, or click **Reset to Original**
- [ ] Demonstrate the **Select Spectrum Region** tool: draw a box over the emission lines, adjust handles, click **Analyse Selected Region**
- [ ] Show how the graphs and peak annotations immediately update to reflect only the selected pixels
- [ ] Click **Exit Demo** and upload a real DIY CD/DVD spectroscope photograph
- [ ] Show the Brightness Profile graph (explain the ITU-R BT.709 luminance formula)
- [ ] Show the RGB Channel graph (explain color channel separation)
- [ ] Enter calibration reference points and click **Apply Calibration**
- [ ] Show the calibrated spectrum (λ = a·x + b linear dispersion equation)
- [ ] Go to **Compare Spectra**, upload or load a second photograph to overlay spectra
- [ ] Go to **Results & Export**, download the CSV data and chart PNGs
- [ ] Show the **Physics & Theory** section covering diffraction grating equation, CD track spacing, and dispersion principles

---

## Technology Stack

- **HTML5** — semantic structure, Canvas API
- **CSS3** — custom properties, flexbox, grid, print styles
- **Vanilla JavaScript (ES2020)** — `createImageBitmap`, `OffscreenCanvas`, `getImageData`
- **Chart.js 4.4** — interactive charts (CDN, no build required)
- No frameworks, no backend, no database, no authentication

---

*Engineering Physics Lab — First Year B.Tech*  
*All image processing is performed locally in the browser. No photographs are uploaded to any server.*
