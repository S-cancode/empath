import { useState, useRef, useCallback, useEffect } from "react";
import { Audio } from "expo-av";

const MAX_DURATION_MS = 60_000;
const METERING_INTERVAL = 100; // sample every 100ms

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
  start: () => Promise<void>;
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
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, [cleanup]);

  const start = useCallback(async () => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) return;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync({
      ...Audio.RecordingOptionsPresets.LOW_QUALITY,
      isMeteringEnabled: true,
    });

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
  }, []);

  const stop = useCallback(async (): Promise<{ base64: string; durationMs: number; waveform: number[] } | null> => {
    if (!recordingRef.current) return null;

    const recording = recordingRef.current;
    recordingRef.current = null;
    const durationMs = Date.now() - startTimeRef.current;
    const finalWaveform = [...waveformRef.current];
    cleanup();

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    if (!uri) return null;

    const base64 = await uriToBase64(uri);

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    return { base64, durationMs: Math.min(durationMs, MAX_DURATION_MS), waveform: finalWaveform };
  }, [cleanup]);

  const cancel = useCallback(async () => {
    if (!recordingRef.current) return;

    const recording = recordingRef.current;
    recordingRef.current = null;
    cleanup();
    waveformRef.current = [];
    setWaveform([]);

    await recording.stopAndUnloadAsync();

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
  }, [cleanup]);

  return { isRecording, durationSec, waveform, start, stop, cancel };
}
