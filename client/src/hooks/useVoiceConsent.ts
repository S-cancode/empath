import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { recordConsent } from "@/api/compliance.api";
import { createHash } from "@/lib/hash";

export const VOICE_CONSENT_VERSION = "1.0";
const STORAGE_KEY = "voice_notice_accepted_version";

export const VOICE_CONSENT_TEXT =
  "Voice notes are automatically transcribed and checked for safety before " +
  "being sent, using OpenAI (servers in the United States). The temporary " +
  "transcript is not shown to other users and is discarded after the safety " +
  "check. Reported voice notes may be reviewed by an authorised moderator. " +
  "You can continue using text chat without enabling voice.";

/**
 * Gate microphone use behind an explicit, versioned voice-privacy notice.
 * Resolves true if the user has accepted (now or previously); false if they
 * decline — in which case the caller must NOT request microphone permission
 * and text chat stays fully usable.
 */
export function useVoiceConsent() {
  const ensureVoiceConsent = useCallback(async (): Promise<boolean> => {
    const accepted = await AsyncStorage.getItem(STORAGE_KEY);
    if (accepted === VOICE_CONSENT_VERSION) return true;

    return new Promise<boolean>((resolve) => {
      Alert.alert("Before you send a voice note", VOICE_CONSENT_TEXT, [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        {
          text: "I understand — enable voice",
          onPress: async () => {
            await AsyncStorage.setItem(STORAGE_KEY, VOICE_CONSENT_VERSION);
            try {
              const textHash = await createHash(VOICE_CONSENT_TEXT);
              await recordConsent({
                consentType: "voice_notes",
                version: VOICE_CONSENT_VERSION,
                granted: true,
                textHash,
                deviceType: Platform.OS,
              });
            } catch {
              // Consent logging is best-effort; local acceptance is the gate.
            }
            resolve(true);
          },
        },
      ]);
    });
  }, []);

  return { ensureVoiceConsent };
}
