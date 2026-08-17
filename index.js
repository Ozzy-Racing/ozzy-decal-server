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

    // Dropped from fine:5/detailed:4 — the one variable being tested this
    // round. This is VTracer's own native colour clustering, done before
    // it decides on shape geometry at all, rather than us reconstructing
    // colour logic by hand afterward (which caused real bugs three times
    // running — see decalEngine.js history). Lower means fewer distinct
    // colour clusters survive its own trace.
    const colorPrecision = 3;
    // filterSpeckle round 2 — fine:4/detailed:5 -> fine:8/detailed:10 took
    // this same test image from 346 files/4,194 colours down to 76
    // files/656 colours with only a slight visible change (some fine
    // hairline/highlight detail merged away, nothing structurally wrong).
    // Pushing further to see where it starts costing real detail rather
    // than just noise — still the one variable being tested.
    const filterSpeckle = detailMode === 'fine' ? 16 : 20;

    // Switched from Stacked to Cutout — paired with a client-side change
    // (pre-quantising the photo to a small flat palette before it's ever
    // sent here). Stacked was the right choice for raw photos (avoids the
    // seam/hole issues Cutout has on gradient-heavy content), but it makes
    // later shapes able to depend on covering earlier ones — fine for
    // photos, but it broke once the client started sending an
    // already-flat, quantised image and the app's colour-merge step
    // (groupSimilarHueColours) needed to consolidate same-coloured shapes
    // that VTracer had drawn at very different depths. Cutout produces
    // genuinely non-overlapping, order-independent tiles, which is a
    // natural fit for a flat input with no gradients to worry about, and
    // makes that merge step safe again. Verified against a real
    // quantised+traced result before this went live: Stacked produced a
    // large near-black shape covering most of the correct colour detail
    // after merging; Cutout didn't.
    const svg = await vectorize(buffer, {
      colorMode: ColorMode.Color,
      colorPrecision,
      filterSpeckle,
      spliceThreshold: 45,
      cornerThreshold: 60,
      hierarchical: Hierarchical.Cutout,
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
