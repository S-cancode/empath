import { useState, useRef, useCallback, useEffect } from "react";
import { Audio } from "expo-av";
import { File } from "expo-file-system";

const MAX_DURATION_MS = 60_000;
const METERING_INTERVAL = 100; // sample every 100ms
const MAX_WAVEFORM_SAMPLES = 600; // server hard limit

/** Cap the waveform to the server limit, downsampling by max-in-bucket. */
function capWaveform(samples: number[]): number[] {
  if (samples.length <= MAX_WAVEFORM_SAMPLES) return samples;
  const out: number[] = [];
  const step = samples.length / MAX_WAVEFORM_SAMPLES;
  for (let i = 0; i < MAX_WAVEFORM_SAMPLES; i++) {
    let max = 0;
    for (let j = Math.floor(i * step); j < Math.floor((i + 1) * step) && j < samples.length; j++) {
      if (samples[j] > max) max = samples[j];
    }
    out.push(max);
  }
  return out;
}

export type StartResult = "started" | "denied" | "error";

/** Always reset iOS audio mode back to playback after recording. */
async function resetAudioMode(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
  } catch {}
}

/** Delete the raw source recording file once we have the base64. */
function deleteSourceFile(uri: string | null): void {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {}
}

/** Convert a local file URI to a base64 string using fetch + blob reader */
async function uriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Convert dBFS metering value (-160 to 0) to a 0-1 normalized level */
function dbToNormalized(db: number): number {
  // dBFS: -160 is silence, 0 is max
  const clamped = Math.max(-60, Math.min(0, db));
  return (clamped + 60) / 60;
}

interface VoiceRecorderResult {
  isRecording: boolean;
  durationSec: number;
  waveform: number[];
  start: () => Promise<StartResult>;
  stop: () => Promise<{ base64: string; durationMs: number; waveform: number[] } | null>;
  cancel: () => Promise<void>;
}

export function useVoiceRecorder(): VoiceRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const waveformRef = useRef<number[]>([]);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (meterRef.current) {
      clearInterval(meterRef.current);
      meterRef.current = null;
    }
    setDurationSec(0);
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      if (recordingRef.current) {
        const rec = recordingRef.current;
        recordingRef.current = null;
        rec.stopAndUnloadAsync()
          .then(() => deleteSourceFile(rec.getURI()))
          .catch(() => {})
          .finally(() => resetAudioMode());
      }
    };
  }, [cleanup]);

  const start = useCallback(async (): Promise<StartResult> => {
    // Caller is responsible for showing the voice consent notice before this.
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) return "denied";

    let recording: Audio.Recording;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      ({ recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.LOW_QUALITY,
        isMeteringEnabled: true,
      }));
    } catch {
      await resetAudioMode();
      return "error";
    }

    recordingRef.current = recording;
    startTimeRef.current = Date.now();
    waveformRef.current = [];
    setWaveform([]);
    setIsRecording(true);
    setDurationSec(0);

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setDurationSec(elapsed);
    }, 500);

    // Sample metering levels
    meterRef.current = setInterval(async () => {
      if (!recordingRef.current) return;
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording && status.metering !== undefined) {
          const level = dbToNormalized(status.metering);
          waveformRef.current.push(level);
          setWaveform([...waveformRef.current]);
        }
      } catch {}
    }, METERING_INTERVAL);

    return "started";
  }, []);

  const stop = useCallback(async (): Promise<{ base64: string; durationMs: number; waveform: number[] } | null> => {
    if (!recordingRef.current) return null;

    const recording = recordingRef.current;
    recordingRef.current = null;
    const durationMs = Date.now() - startTimeRef.current;
    const finalWaveform = [...waveformRef.current];
    cleanup();

    let uri: string | null = null;
    try {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
      if (!uri) return null;
      const base64 = await uriToBase64(uri);
      return { base64, durationMs: Math.min(durationMs, MAX_DURATION_MS), waveform: capWaveform(finalWaveform) };
    } finally {
      // Always reset the audio mode and delete the raw source recording,
      // whether we succeeded, failed, or returned early.
      await resetAudioMode();
      deleteSourceFile(uri);
    }
  }, [cleanup]);

  const cancel = useCallback(async () => {
    if (!recordingRef.current) return;

    const recording = recordingRef.current;
    recordingRef.current = null;
    cleanup();
    waveformRef.current = [];
    setWaveform([]);

    let uri: string | null = null;
    try {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
    } finally {
      await resetAudioMode();
      deleteSourceFile(uri);
    }
  }, [cleanup]);

  return { isRecording, durationSec, waveform, start, stop, cancel };
}
