/** A single displayable still recovered from an upstream response. */
export interface FrameData {
  body: Uint8Array
  mime: 'image/jpeg' | 'image/png'
}

function sniffImageMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes.length < 4) return null
  // JPEG SOI: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  // PNG signature: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  return null
}

// Index of the first JPEG SOI marker (FF D8 FF) anywhere in `bytes`, or -1.
function indexOfJpegStart(bytes: Uint8Array): number {
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) return i
  }
  return -1
}

/**
 * Coerce a response body into a single displayable still, or null if none can
 * be recovered. Three cases:
 *   1. The body already starts with a JPEG/PNG signature — use it verbatim.
 *   2. The body *contains* a JPEG that isn't at offset 0 — typically an MJPEG
 *      `multipart/x-mixed-replace` part, where the JPEG follows the multipart
 *      boundary + part headers. We slice from the SOI (FF D8 FF) to the EOI
 *      (FF D9) so we return exactly one frame rather than the whole envelope.
 *      A surprising number of cams only expose video.cgi / ?action=snapshot
 *      style endpoints, so recovering one frame from them is a big coverage
 *      win over rejecting the whole response as non-image.
 *   3. Anything else (HTML error pages, etc.) — null.
 *
 * The embedded-JPEG scan is gated on an image/multipart/unlabeled content-type
 * so a text/html body that merely happens to contain FF D8 FF bytes isn't
 * misread as a frame.
 */
export function coerceImageFrame(body: Uint8Array, contentType: string): FrameData | null {
  const direct = sniffImageMime(body)
  if (direct) return { body, mime: direct }

  const ct = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  const mayContainJpeg = ct === ''
    || ct.startsWith('image/')
    || ct.startsWith('multipart/')
    || contentType.includes('mixed-replace')
  if (!mayContainJpeg) return null

  const start = indexOfJpegStart(body)
  if (start < 0) return null
  // Find the EOI after the SOI. If it's missing (e.g. a truncated probe peek),
  // fall back to the rest of the buffer — a partial JPEG still renders.
  let end = body.length
  for (let i = start + 2; i + 1 < body.length; i++) {
    if (body[i] === 0xff && body[i + 1] === 0xd9) {
      end = i + 2
      break
    }
  }
  return { body: body.subarray(start, end), mime: 'image/jpeg' }
}
