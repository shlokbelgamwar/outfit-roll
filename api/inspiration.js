import { fail, route } from '../lib/providers.js';

export default route('GET', async (req, res) => {
  const { q } = req.query;
  if (typeof q !== 'string' || !/^[a-z -]{3,100}$/.test(q)) fail(400, 'Choose an outfit to find inspiration.');
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) fail(503, 'Photo inspiration will appear when the Unsplash key is added.');
  const url = new URL('https://api.unsplash.com/search/photos');
  url.search = new URLSearchParams({ query: q, per_page: '4', orientation: 'portrait', content_filter: 'high' });
  const response = await fetch(url, {
    headers: { Authorization: 'Client-ID ' + key, 'Accept-Version': 'v1' },
    signal: AbortSignal.timeout(12000)
  });
  if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) {
    fail(429, 'Unsplash has reached its photo limit. Your outfit is ready, and photos will be back later.', response.headers.get('retry-after'));
  }
  if (!response.ok) fail(502, 'Photo inspiration is temporarily unavailable.');
  const { results } = await response.json();
  const attribution = '?utm_source=outfit_roll&utm_medium=referral';
  const photos = results.map(photo => ({
    image: photo.urls.small,
    alt: photo.alt_description || 'Outfit inspiration',
    page: photo.links.html + attribution,
    author: photo.user.name,
    profile: photo.user.links.html + attribution
  }));
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=3600');
  res.json({ photos });
});
