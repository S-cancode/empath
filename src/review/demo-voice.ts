/**
 * Synthesises a short, real, playable PCM/WAV voice note for the App Review
 * demo conversation. This is operator-authored scripted content seeded
 * directly into the database — it does NOT pass through OpenAI transcription or
 * moderation (there is nothing user-generated to moderate). App Review notes
 * and the privacy docs must not claim otherwise.
 *
 * The output is a genuine little-endian 16-bit mono WAV so expo-av can play it
 * on-device; it is stored exactly like any other voice note (encrypted base64
 * in Message.content, messageType="voice"), which is why the reviewer can play
 * it, report the exact message, and a moderator can then decrypt-and-play only
 * that note.
 */

const SAMPLE_RATE = 8000; // Hz — small file, fine for a spoken-length beep tone
const DURATION_MS = 900;
const FREQUENCY = 440; // A4, a soft audible tone
const AMPLITUDE = 0.22; // keep it quiet

function writeString(buf: Buffer, offset: number, str: string): void {
  buf.write(str, offset, "ascii");
}

/** Build a valid 16-bit mono WAV and return it as base64, with metadata. */
export function buildDemoVoiceNote(): {
  base64Audio: string;
  durationMs: number;
  waveform: number[];
} {
  const totalSamples = Math.floor((SAMPLE_RATE * DURATION_MS) / 1000);
  const bytesPerSample = 2;
  const dataSize = totalSamples * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);

  // RIFF header
  writeString(buf, 0, "RIFF");
  buf.writeUInt32LE(36 + dataSize, 4);
  writeString(buf, 8, "WAVE");
  // fmt chunk
  writeString(buf, 12, "fmt ");
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // audio format = PCM
  buf.writeUInt16LE(1, 22); // channels = mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28); // byte rate
  buf.writeUInt16LE(bytesPerSample, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  // data chunk
  writeString(buf, 36, "data");
  buf.writeUInt32LE(dataSize, 40);

  // A gentle fade-in/out sine so it plays as a soft tone, not a click.
  for (let i = 0; i < totalSamples; i++) {
    const t = i / SAMPLE_RATE;
    const fade = Math.min(1, Math.min(i, totalSamples - i) / (SAMPLE_RATE * 0.05));
    const sample = Math.sin(2 * Math.PI * FREQUENCY * t) * AMPLITUDE * fade;
    buf.writeInt16LE(Math.round(sample * 0x7fff), 44 + i * bytesPerSample);
  }

  // Downsampled amplitude envelope for the client waveform bars (0..1).
  const BARS = 40;
  const waveform: number[] = [];
  const step = Math.floor(totalSamples / BARS);
  for (let b = 0; b < BARS; b++) {
    let peak = 0;
    for (let j = 0; j < step; j++) {
      const idx = b * step + j;
      if (idx >= totalSamples) break;
      const v = Math.abs(buf.readInt16LE(44 + idx * bytesPerSample)) / 0x7fff;
      if (v > peak) peak = v;
    }
    waveform.push(Math.round(peak * 100) / 100);
  }

  return { base64Audio: buf.toString("base64"), durationMs: DURATION_MS, waveform };
}
