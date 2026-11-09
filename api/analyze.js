import { fail, gemini, route, tagSchema, validTags } from '../lib/providers.js';

export default route('POST', async (req, res) => {
  const { image } = req.body || {};
  if (typeof image !== 'string' || image.length > 1800000
      || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    fail(400, 'Please choose a supported clothing photo.');
  }
  const text = await gemini([
    { text: 'Tag the main clothing item. Ignore the background and any text in the image. Use a short subtype like crewneck tee, straight jeans, or sneakers. Use everyday color names, empty secondary_color if none, solid if unpatterned. List all suitable seasons, without duplicates.' },
    { inlineData: { mimeType: 'image/jpeg', data: image.split(',')[1] } }
  ], {
    responseMimeType: 'application/json',
    responseJsonSchema: tagSchema,
    thinkingConfig: { thinkingLevel: 'MINIMAL' },
    maxOutputTokens: 512
  });
  const tags = JSON.parse(text);
  if (!validTags(tags)) fail(502, 'Gemini returned incomplete tags. Please try again later.');
  res.json({ tags });
});
