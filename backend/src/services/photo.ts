// Profile pictures are small square JPEGs made in the browser (camera or upload) and stored as a data URL on the
// employee record, so there are no files to look after and they travel with the database backups.

const MAX_CHARS = 400_000; // roughly 300 KB of image; the app makes them about 20-40 KB
const MIN_CHARS = 500;

/** Returns the picture when it is a valid image data URL of a sensible size, otherwise null. */
export function cleanPhoto(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length < MIN_CHARS || s.length > MAX_CHARS) return null;
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(s) ? s : null;
}
