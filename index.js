// Ozzy Decal Creator — server-side tracing.
//
// The app itself does all the GT7-specific work (splitting shapes to fit the
// 15KB-per-file limit, packing colours into files, writing the layering
// instructions) — that stays on-device. This server does exactly one thing:
// the actual image tracing, using the real VTracer engine (via
// @neplex/vectorizer), which produces meaningfully cleaner results than a
// pure-JS tracer running in a browser can. The app sends a photo here,
// gets back an SVG, and does everything else itself.

import express from 'express';
import cors from 'cors';
import { vectorize, ColorMode, Hierarchical, PathSimplifyMode } from '@neplex/vectorizer';

const app = express();

// Images arrive as base64 JSON — 15MB covers a genuinely large source photo
// with real headroom, while still refusing anything absurd.
app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.get('/', (req, res) => {
  res.send('Ozzy Decal Creator trace server is running.');
});

app.post('/trace', async (req, res) => {
  try {
    const { imageBase64, detailMode } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64' });
    }

    const buffer = Buffer.from(imageBase64, 'base64');

    // Prioritising accuracy over file size for now — deliberately. File
    // count/size is a separate, later problem (SVGs scale cleanly with no
    // quality loss, so getting the trace genuinely accurate first is what
    // actually matters before worrying about compression at all).
    const colorPrecision = detailMode === 'fine' ? 9 : 8;
    const filterSpeckle = detailMode === 'fine' ? 2 : 3;

    const svg = await vectorize(buffer, {
      colorMode: ColorMode.Color,
      colorPrecision,
      filterSpeckle,
      spliceThreshold: 45,
      cornerThreshold: 60,
      hierarchical: Hierarchical.Stacked,
      mode: PathSimplifyMode.Spline,
      layerDifference: 5,
      lengthThreshold: 5,
      maxIterations: 2,
      pathPrecision: 2,
    });

    res.json({ svg });
  } catch (err) {
    console.error('Trace failed:', err);
    res.status(500).json({ error: 'Tracing failed on the server.', detail: String(err && err.message || err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Ozzy Decal trace server listening on port ${PORT}`);
});
