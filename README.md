# Outfit Roll

Outfit Roll turns a personal closet into wearable color-matched combinations. Load the sample closet to try it immediately. For the best color extraction, photograph one garment against a plain background with the garment centered.

## Deploy on Vercel

Use the **Other** framework preset. The app serves `public/` and runs the Node.js handlers under `api/`. Add these as **Secret** environment variables in **Settings → Environment Variables**, select **Production** (and Preview if needed), then redeploy.

- `GEMINI_API_KEY` — Google AI Studio key for Gemini 3.1 Flash-Lite.
- `UNSPLASH_ACCESS_KEY` — the Unsplash application Access Key.

For local development with the Vercel CLI, run `vercel dev`. The sample closet and local roll work without either key.

## Data flow

Photos are resized in the browser, then sent to Gemini only when an image has no saved analysis. The original file's SHA-256 fingerprint, resized image, extracted color, and tags are stored in IndexedDB. Duplicate uploads reuse tags, even after removing an item from the closet. Rejected requests can be retried by choosing the file again. Deduplication applies to identical files in the same browser and origin while its site data is retained.

Rolling and color scoring run in the browser. The optional stylist note sends only the selected tags and color rule. The inspiration shelf sends a few color and occasion keywords to Unsplash and caches successful searches. It uses Unsplash-hosted images with linked photographer credits.
