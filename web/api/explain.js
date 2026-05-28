/**
 * Vercel serverless function — Gemini proxy for "Explain this day" button.
 *
 * The browser POSTs `{ date: "YYYY-MM-DD", impact?: {...} }` (or GETs
 * `?date=YYYY-MM-DD`). We read the Gemini API key from
 * `process.env.GEMINI_API_KEY` (server-side ONLY — never returned to the
 * client, never logged), build the prompt here, and call
 * `generativelanguage.googleapis.com` with the built-in `fetch`
 *
 * Grounding: the request enables the Google Search tool, so Gemini searches
 * the live web before answering. This sharply reduces date-specific
 * hallucination (a plain generateContent call has no web access and
 * confidently invents plausible-sounding events).
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function formatHumanDate(isoDate) {
  // Build a UTC Date so the weekday/month never shift by host TZ.
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = dt.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const month = dt.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${weekday}, ${month} ${d}, ${y}`;
}

/**
 * Describe the observed change in plain words from the optional `impact`
 * payload the client sends. The client already computes the before/during
 * trip levels for the panel; passing them here lets the prompt state the
 * REAL direction and magnitude, so Gemini cannot get the direction backwards
 * (e.g. claiming a surge on a day trips actually fell). When no impact data
 * is supplied we fall back to a neutral "notably different" phrasing.
 *
 * `impact` shape (all optional): { pctChange, beforeLevel, duringLevel }
 *   - pctChange  : signed % change of during vs before (e.g. -74)
 *   - beforeLevel: mean daily trips in the baseline window
 *   - duringLevel: trips on the selected day
 */
function describeObservedChange(impact) {
  if (!impact || typeof impact.pctChange !== 'number' || !isFinite(impact.pctChange)) {
    return 'daily NYC taxi trip volume was notably different from the surrounding days';
  }
  const pct = Math.round(Math.abs(impact.pctChange));
  const dir = impact.pctChange < 0 ? 'fell' : 'rose';
  const haveLevels =
    typeof impact.beforeLevel === 'number' && isFinite(impact.beforeLevel) &&
    typeof impact.duringLevel === 'number' && isFinite(impact.duringLevel);
  const levels = haveLevels
    ? ` (from roughly ${Math.round(impact.beforeLevel).toLocaleString('en-US')} ` +
      `to roughly ${Math.round(impact.duringLevel).toLocaleString('en-US')} trips)`
    : '';
  if (pct < 5) {
    return 'daily NYC taxi trip volume was close to the surrounding-days baseline';
  }
  return `daily NYC taxi trips ${dir} sharply — about ${pct}% ` +
    `${impact.pctChange < 0 ? 'below' : 'above'} the surrounding-days baseline${levels}`;
}

function buildPrompt(isoDate, impact) {
  const human = formatHumanDate(isoDate);
  const observed = describeObservedChange(impact);
  return (
    `On ${human}, ${observed}. ` +
    `Using Google Search, identify what actually happened in New York City ` +
    `on or very close to that exact date that could plausibly explain this ` +
    `change in taxi demand — for example weather, a holiday, a transit ` +
    `disruption, a major event, or a public emergency.\n\n` +
    `Rules:\n` +
    `- The date is fixed: ${human}. Only cite events you can confirm ` +
    `occurred on or within a day or two of that exact date. Do NOT attach a ` +
    `well-known event to this date unless it genuinely happened then.\n` +
    `- Respect the observed direction of the change: do not describe an ` +
    `increase if trips fell, or a decrease if trips rose.\n` +
    `- If you cannot find a confident, specific cause, say so plainly ` +
    `("no clearly notable cause is documented for this date"). It is better ` +
    `to admit uncertainty than to name an event that may be wrong.\n` +
    `- Answer in 3-4 plain sentences. Do not speculate beyond what the ` +
    `search results support.`
  );
}

export default async function handler(req, res) {
  try {
    let date;
    let impact;
    if (req.method === 'GET') {
      // Query string can arrive via req.query (Vercel parses it) or be parsed
      // from req.url as a fallback when running under raw Node.
      date = (req.query && req.query.date)
        || (req.url ? new URL(req.url, 'http://localhost').searchParams.get('date') : null);
      // GET does not carry impact data; prompt falls back to neutral phrasing.
    } else if (req.method === 'POST') {
      const body = await readBody(req);
      date = body && body.date;
      impact = body && body.impact;
    } else {
      res.setHeader('Allow', 'GET, POST');
      return jsonResponse(res, 405, { error: 'Method not allowed' });
    }

    if (typeof date !== 'string' || !ISO_DATE_RE.test(date)) {
      return jsonResponse(res, 400, { error: 'Invalid date — expected YYYY-MM-DD' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonResponse(res, 500, { error: 'Gemini API key not configured' });
    }

    const prompt = buildPrompt(date, impact);
    const upstream = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Google Search grounding — lets Gemini search the live web before
        // answering, instead of relying on (and hallucinating from) its training data.
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
      }),
    });

    if (!upstream.ok) {
      return jsonResponse(res, 502, { error: 'Gemini request failed' });
    }

    const data = await upstream.json();
    // With grounding the answer may be split across several parts; concatenate
    // every text part rather than reading only parts[0].
    const parts =
      data && data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts;
    const text = Array.isArray(parts)
      ? parts.map(p => (p && typeof p.text === 'string' ? p.text : '')).join('').trim()
      : '';

    if (!text) {
      return jsonResponse(res, 502, { error: 'Empty response from Gemini' });
    }

    return jsonResponse(res, 200, { explanation: text });
  } catch (err) {
    // Log a short, key-free message so Vercel function logs remain safe.
    console.error('[explain] handler error:', err && err.message ? err.message : 'unknown');
    return jsonResponse(res, 500, { error: 'Internal error' });
  }
}