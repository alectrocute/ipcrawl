/** Parse a route param that may carry an image extension, e.g. `<id>.jpg`. */
export function parseImageCamIdParam(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value
  return (typeof raw === 'string' ? raw : '').replace(/\.(jpe?g|png)$/i, '').trim()
}
