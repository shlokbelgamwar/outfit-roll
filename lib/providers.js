export const types = ['top', 'bottom', 'outerwear', 'shoes', 'accessory'];
export const occasions = ['casual', 'smart', 'formal'];
export const seasons = ['spring', 'summer', 'fall', 'winter'];

export const tagSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: types },
    subtype: { type: 'string' },
    primary_color: { type: 'string' },
    secondary_color: { type: 'string' },
    pattern: { type: 'string' },
    formality: { type: 'string', enum: occasions },
    season: { type: 'array', items: { type: 'string', enum: seasons } }
  },
  required: ['type', 'subtype', 'primary_color', 'secondary_color', 'pattern', 'formality', 'season']
};

export function validTags(tags) {
  return tags && types.includes(tags.type) && occasions.includes(tags.formality)
    && ['subtype', 'primary_color', 'secondary_color', 'pattern'].every(key =>
      typeof tags[key] === 'string' && tags[key].length <= 100)
    && Array.isArray(tags.season) && tags.season.length <= 4
    && tags.season.every(season => seasons.includes(season));
}

export function route(method, handler) {
  return async (req, res) => {
    if (req.method !== method) {
      res.setHeader('Allow', method);
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    try {
      await handler(req, res);
    } catch (error) {
      const status = error.status || 502;
      if (error.retryAfter) res.setHeader('Retry-After', error.retryAfter);
      res.status(status).json({
        error: error.status ? error.message : 'The service is taking a break. Please try again shortly.'
      });
    }
  };
}

export function fail(status, message, retryAfter) {
  throw Object.assign(new Error(message), { status, retryAfter });
}

export async function gemini(parts, generationConfig) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) fail(503, 'Gemini is waiting for its API key. The sample closet is ready to roll.');
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts }], generationConfig }),
    signal: AbortSignal.timeout(20000)
  });
  if (response.status === 429) {
    fail(429, 'Gemini has reached its usage limit. Try again later or roll with your saved closet.', response.headers.get('retry-after'));
  }
  if (!response.ok) fail(502, 'Gemini is unavailable right now. Please try again later.');
  const data = await response.json();
  const answer = data.candidates?.[0]?.content?.parts?.filter(part => !part.thought)
    .map(part => part.text || '').join('').trim();
  if (!answer) fail(422, 'Gemini could not read this request. Try a clear photo of one garment.');
  return answer;
}
