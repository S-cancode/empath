import { describe, it, expect } from "vitest";
import { sniffAudioMime } from "./audio-mime.js";

const b64 = (bytes: number[] | Buffer) => Buffer.from(bytes as never).toString("base64");

describe("sniffAudioMime", () => {
  it("recognises RIFF/WAVE as audio/wav", () => {
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WAVE"), Buffer.from([1, 2, 3, 4])]);
    expect(sniffAudioMime(wav.toString("base64"))).toBe("audio/wav");
  });

  it("recognises an ISO-BMFF ftyp box (M4A/MP4) as audio/mp4", () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftyp"), Buffer.from("M4A ")]);
    expect(sniffAudioMime(mp4.toString("base64"))).toBe("audio/mp4");
  });

  it("returns null for unrecognised bytes (fail safe)", () => {
    expect(sniffAudioMime(b64(Buffer.from("this is not audio")))).toBeNull();
  });

  it("returns null for too-short input", () => {
    expect(sniffAudioMime(b64([0x52, 0x49, 0x46]))).toBeNull();
  });

  it("does not misclassify a RIFF that is not WAVE", () => {
    const riffAvi = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("AVI ")]);
    expect(sniffAudioMime(riffAvi.toString("base64"))).toBeNull();
  });
});
