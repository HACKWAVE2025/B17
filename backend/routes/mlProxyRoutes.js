const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');

const router = express.Router();
const upload = multer();

// Base URL for the Python Flask service providing ML endpoints
// agrotech-ai-apis (crop recommendation, disease (predict), mushroom, seed)
const FLASK_API_BASE = process.env.FLASK_API_BASE || 'http://127.0.0.1:5000';
// agrotech-api`s (fertilizer, irrigation, prices, commodity, soil as fallback)
const AGRO_API_BASE = process.env.AGRO_API_BASE || 'http://127.0.0.1:5001';
// soil-testing API base (optional override for soil quality)
const SOIL_API_BASE = process.env.SOIL_API_BASE || AGRO_API_BASE || FLASK_API_BASE;
// disease specific services
const DISEASE_API_BASE = process.env.DISEASE_API_BASE || FLASK_API_BASE; // uses /predict
const PADDY_API_BASE = process.env.PADDY_API_BASE || 'http://127.0.0.1:5002';
const SUGARCANE_API_BASE = process.env.SUGARCANE_API_BASE || 'http://127.0.0.1:5003';
// chatbot service
const CHATBOT_API_BASE = process.env.CHATBOT_API_BASE || 'http://127.0.0.1:5004';
// mushroom (falls back to FLASK_API_BASE)
const MUSHROOM_API_BASE = process.env.MUSHROOM_API_BASE || FLASK_API_BASE;

// Helpers: canonicalization and validation
const CROP_CANON = {
  groundnut: 'Groundnut',
  millets: 'Millets',
  wheat: 'Wheat',
  maize: 'Maize',
  cotton: 'Cotton',
  sorghum: 'Sorghum',
  barley: 'Barley',
};

const SOIL_CANON = {
  loamy: 'Loamy',
  clayey: 'Clayey',
  sandy: 'Sandy',
  saline: 'Saline',
};

const canonStr = (val) => String(val ?? '').trim().toLowerCase();
const toNumber = (val) => (typeof val === 'number' ? val : Number(String(val).trim()));

// Proxy: Crop recommendation
// POST /api/crop  ->  {FLASK_API_BASE}/crop_recommendation
router.post('/crop', async (req, res) => {
  try {
    const url = `${FLASK_API_BASE}/crop_recommendation`;

    const body = req.body || {};
    const hasModelShape =
      Object.prototype.hasOwnProperty.call(body, 'Previous Crop') ||
      Object.prototype.hasOwnProperty.call(body, 'Soil Type') ||
      Object.prototype.hasOwnProperty.call(body, 'Moisture Level');

    // If the request already matches the Flask model's expected keys, pass through
    if (hasModelShape) {
      const response = await axios.post(url, body, { timeout: 15000 });
      if (req.query.debug) {
        return res.status(response.status).json({ input: body, upstream: response.data });
      }
      return res.status(response.status).json(response.data);
    }

    // Otherwise, validate and (optionally) transform from our simpler API shape
    const {
      nitrogen,
      phosphorus,
      potassium,
      previousCrop,
      soilType,
      moistureLevel
    } = body;

    const missing = [];
    if (nitrogen == null) missing.push('nitrogen');
    if (phosphorus == null) missing.push('phosphorus');
    if (potassium == null) missing.push('potassium');
    if (!previousCrop) missing.push('previousCrop');
    if (!soilType) missing.push('soilType');
    if (moistureLevel == null) missing.push('moistureLevel');

    if (missing.length) {
      return res.status(400).json({
        error: 'Missing required fields for crop recommendation',
        missing,
        expectedShape: {
          previousCrop: 'Groundnut|Millets|Wheat|Maize|Cotton|Sorghum|Barley',
          soilType: 'Loamy|Clayey|Sandy|Saline',
          moistureLevel: 'number (e.g., 30)',
          nitrogen: 'number (N)',
          phosphorus: 'number (P)',
          potassium: 'number (K)'
        },
        note:
          'Your previous request used keys like temperature, humidity, ph_level, rainfall which are not used by this particular model.'
      });
    }

    // Canonicalize inputs (case-insensitive strings, numeric coercion)
    const cropCanon = CROP_CANON[canonStr(previousCrop)];
    const soilCanon = SOIL_CANON[canonStr(soilType)];
    const n = toNumber(nitrogen);
    const p = toNumber(phosphorus);
    const k = toNumber(potassium);
    const m = toNumber(moistureLevel);

    const errors = [];
    if (!cropCanon) errors.push(`previousCrop must be one of: ${Object.values(CROP_CANON).join('|')}`);
    if (!soilCanon) errors.push(`soilType must be one of: ${Object.values(SOIL_CANON).join('|')}`);
    if (!Number.isFinite(n)) errors.push('nitrogen must be a number');
    if (!Number.isFinite(p)) errors.push('phosphorus must be a number');
    if (!Number.isFinite(k)) errors.push('potassium must be a number');
    if (!Number.isFinite(m)) errors.push('moistureLevel must be a number');

    if (errors.length) {
      return res.status(400).json({ error: 'Invalid input', errors });
    }

    const modelPayload = {
      'Previous Crop': cropCanon,
      'Soil Type': soilCanon,
      'Moisture Level': m,
      'Nitrogen (N)': n,
      'Phosphorus (P)': p,
      'Potassium (K)': k
    };

    const response = await axios.post(url, modelPayload, { timeout: 15000 });
    if (req.query.debug) {
      return res.status(response.status).json({ input: modelPayload, upstream: response.data });
    }
    return res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: 'Upstream service error' };
    console.error('[mlProxy] /crop proxy error:', err.message);
    return res.status(status).json(data);
  }
});
// Proxy: Soil quality prediction
// POST /api/soil-quality -> {FLASK_API_BASE}/soil_quality_predict
router.post('/soil-quality', async (req, res) => {
  try {
    const url = `${SOIL_API_BASE}/soil_quality_predict`;
    const b = req.body || {};

    // Coerce numeric fields
    const keys = ['N','P','K','pH','EC','OC','S','Zn','Fe','Cu','Mn','B'];
    const numeric = {};
    const missing = [];
    const invalid = [];
    for (const k of keys) {
      if (b[k] == null) { missing.push(k); continue; }
      const v = typeof b[k] === 'number' ? b[k] : Number(String(b[k]).trim());
      if (!Number.isFinite(v)) { invalid.push(k); }
      numeric[k] = v;
    }

    if (missing.length || invalid.length) {
      return res.status(400).json({
        error: 'Invalid soil quality payload',
        missing,
        invalid,
        expected: keys
      });
    }

    const response = await axios.post(url, numeric, { timeout: 20000 });
    const upstream = response.data || {};
    const raw = String(upstream.prediction ?? '');
    const labelMap = { '0': 'Poor', '1': 'Moderate', '2': 'Good' };
    const label = labelMap[raw] || raw;

    if (req.query.debug) {
      return res.status(200).json({ input: numeric, upstream, label });
    }
    return res.status(200).json({ prediction: raw, label });
  } catch (err) {
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: 'Upstream service error' };
    console.error('[mlProxy] /soil-quality proxy error:', err.message);
    return res.status(status).json(data);
  }
});
// Fertilizer prediction (POST JSON)
// POST /api/fertilizer -> {AGRO_API_BASE}/fertilizer_predict
router.post('/fertilizer', async (req, res) => {
  try {
    const url = `${AGRO_API_BASE}/fertilizer_predict`;
    const response = await axios.post(url, req.body || {}, { timeout: 20000 });
    return res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: 'Upstream service error' };
    console.error('[mlProxy] /fertilizer proxy error:', err.message);
    return res.status(status).json(data);
  }
});

// Irrigation recommendation (POST JSON)
// POST /api/irrigation -> {AGRO_API_BASE}/irrigation
router.post('/irrigation', async (req, res) => {
  try {
    const url = `${AGRO_API_BASE}/irrigation`;
    const response = await axios.post(url, req.body || {}, { timeout: 20000 });
    return res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: 'Upstream service error' };
    console.error('[mlProxy] /irrigation proxy error:', err.message);
    return res.status(status).json(data);
  }
});

// Prices (GET)
// GET /api/prices -> {AGRO_API_BASE}/price_predict
router.get('/prices', async (_req, res) => {
  try {
    const url = `${AGRO_API_BASE}/price_predict`;
    const response = await axios.get(url, { timeout: 20000 });
    return res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: 'Upstream service error' };
    console.error('[mlProxy] /prices proxy error:', err.message);
    return res.status(status).json(data);
  }
});

// Commodity report (POST JSON)
// POST /api/commodity -> {AGRO_API_BASE}/commodity_predict
router.post('/commodity', async (req, res) => {
  try {
    const url = `${AGRO_API_BASE}/commodity_predict`;
    const response = await axios.post(url, req.body || {}, { timeout: 20000 });
    return res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: 'Upstream service error' };
    console.error('[mlProxy] /commodity proxy error:', err.message);
    return res.status(status).json(data);
  }
});

// Plant disease general (image upload)
// POST /api/disease -> {DISEASE_API_BASE}/predict
router.post('/disease', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing image' });
    const url = `${DISEASE_API_BASE}/predict`;
    const form = new FormData();
    form.append('image', req.file.buffer, { filename: req.file.originalname || 'image.jpg' });
    const response = await axios.post(url, form, { headers: form.getHeaders(), timeout: 60000 });
    return res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: 'Upstream service error' };
    console.error('[mlProxy] /disease proxy error:', err.message);
    return res.status(status).json(data);
  }
});

// Paddy disease (image upload)
// POST /api/paddy -> {PADDY_API_BASE}/submit_paddy
router.post('/paddy', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing image' });
    const url = `${PADDY_API_BASE}/submit_paddy`;
    const form = new FormData();
    form.append('image', req.file.buffer, { filename: req.file.originalname || 'image.jpg' });
    const response = await axios.post(url, form, { headers: form.getHeaders(), timeout: 60000 });
    return res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: 'Upstream service error' };
    console.error('[mlProxy] /paddy proxy error:', err.message);
    return res.status(status).json(data);
  }
});

// Sugarcane disease (image upload)
// POST /api/sugarcane -> {SUGARCANE_API_BASE}/submit_sugarcane
router.post('/sugarcane', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing image' });
    const url = `${SUGARCANE_API_BASE}/submit_sugarcane`;
    const form = new FormData();
    form.append('image', req.file.buffer, { filename: req.file.originalname || 'image.jpg' });
    const response = await axios.post(url, form, { headers: form.getHeaders(), timeout: 60000 });
    return res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: 'Upstream service error' };
    console.error('[mlProxy] /sugarcane proxy error:', err.message);
    return res.status(status).json(data);
  }
});

// Mushroom edibility (x-www-form-urlencoded or JSON)
// POST /api/mushroom -> {MUSHROOM_API_BASE}/mushroom_edibility
router.post('/mushroom', async (req, res) => {
  try {
    const url = `${MUSHROOM_API_BASE}/mushroom_edibility`;
    // Support both application/x-www-form-urlencoded and JSON
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const params = new URLSearchParams(req.body || {});
    const response = await axios.post(url, params, { headers, timeout: 20000 });
    return res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: 'Upstream service error' };
    console.error('[mlProxy] /mushroom proxy error:', err.message);
    return res.status(status).json(data);
  }
});

// Chatbot
// POST /api/chatbot -> {CHATBOT_API_BASE}/AgroTech-ChatBot
router.post('/chatbot', async (req, res) => {
  try {
    const url = `${CHATBOT_API_BASE}/AgroTech-ChatBot`;
    const response = await axios.post(url, req.body || {}, { timeout: 60000 });
    return res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: 'Upstream service error' };
    console.error('[mlProxy] /chatbot proxy error:', err.message);
    return res.status(status).json(data);
  }
});

module.exports = router;

