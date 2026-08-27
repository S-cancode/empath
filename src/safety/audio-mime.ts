/**
 * Server-side audio container sniffing for voice-note playback. We never trust
 * a client-supplied media type — we inspect the decoded bytes for known,
 * validated container signatures and return the matching MIME type, or null for
 * anything we don't recognise (so the caller can fail safe rather than guess).
 *
 *  - RIFF/WAVE  → audio/wav   (the App Review demo fixture)
 *  - ISO-BMFF "ftyp" (M4A/MP4) → audio/mp4  (real recorded voice notes)
 */
export type AudioMime = "audio/wav" | "audio/mp4";

export function sniffAudioMime(base64: string): AudioMime | null {
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    return null;
  }
  if (buf.length < 12) return null;

  // "RIFF" .... "WAVE"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45
  ) {
    return "audio/wav";
  }

  // ISO base media file format: bytes 4..8 == "ftyp" (M4A/MP4/AAC container).
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    return "audio/mp4";
  }

  return null;
}
