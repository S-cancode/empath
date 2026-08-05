import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import { getTranslationSettings, setTranslationSettings, TranslationSettings } from "@/api/settings.api";
import { recordConsent } from "@/api/compliance.api";
import { createHash } from "@/lib/hash";

export const TRANSLATION_CONSENT_VERSION = "1.0";
export const TRANSLATION_CONSENT_TEXT =
  "Turning on auto-translate means every message you send and receive in your conversations " +
  "will be sent to our AI provider, OpenAI (servers in the United States), to be translated, " +
  "and the translated text will be cached in encrypted form on our systems for up to 24 hours. " +
  "Your messages may include sensitive information about your health or emotional wellbeing. " +
  "You can turn this off at any time in Settings.";

const LANG_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
  ru: "Russian",
};

export default function TranslationSettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<TranslationSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getTranslationSettings()
      .then(setSettings)
      .catch(() => Alert.alert("Couldn't load settings", "Please try again."));
  }, []);

  async function save(partial: Partial<TranslationSettings>) {
    if (saving) return;
    setSaving(true);
    try {
      const next = await setTranslationSettings(partial);
      setSettings((prev) => ({ ...(prev ?? {} as TranslationSettings), ...next }));
    } catch (err: any) {
      Alert.alert("Update failed", err?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function logTranslationConsent(granted: boolean) {
    try {
      const textHash = await createHash(TRANSLATION_CONSENT_TEXT);
      await recordConsent({
        consentType: "translation",
        version: TRANSLATION_CONSENT_VERSION,
        granted,
        textHash,
        deviceType: Platform.OS,
      });
    } catch {
      // Consent logging is best-effort; the setting itself is the gate.
    }
  }

  function onToggleAutoTranslate(enabled: boolean) {
    if (!enabled) {
      void logTranslationConsent(false);
      save({ autoTranslateEnabled: false });
      return;
    }
    // Explicit consent before enabling: message content leaves the platform.
    Alert.alert("Before you turn this on", TRANSLATION_CONSENT_TEXT, [
      { text: "Cancel", style: "cancel" },
      {
        text: "I agree — turn on",
        onPress: () => {
          void logTranslationConsent(true);
          save({ autoTranslateEnabled: true });
        },
      },
    ]);
  }

  if (!settings) {
    return (
      <SafeAreaView style={s.container}>
        <Stack.Screen options={{ title: "Translation" }} />
        <View style={s.loading}><Text style={{ color: colors.textSecondary }}>Loading…</Text></View>
      </SafeAreaView>
    );
  }

  const languages = settings.supportedLanguages ?? Object.keys(LANG_LABELS);

  return (
    <SafeAreaView style={s.container}>
      <Stack.Screen options={{ title: "Translation" }} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.sectionHeader}>AUTO-TRANSLATE</Text>
        <View style={s.section}>
          <View style={s.row}>
            <Text style={s.label}>Translate incoming messages</Text>
            <Switch
              value={settings.autoTranslateEnabled}
              onValueChange={onToggleAutoTranslate}
              disabled={saving}
            />
          </View>
          <Text style={s.footnote}>
            Off by default. When on, messages in your conversations are sent to our AI
            provider, OpenAI (US), for translation, and translated text is cached in
            encrypted form for up to 24 hours. Both your incoming and outgoing messages
            are translated. You can turn this off at any time.
          </Text>
        </View>

        <Text style={s.sectionHeader}>LANGUAGE</Text>
        <View style={s.section}>
          {languages.map((code) => {
            const selected = settings.preferredLanguage === code;
            return (
              <TouchableOpacity
                key={code}
                style={s.langRow}
                onPress={() => save({ preferredLanguage: code })}
                disabled={saving}
              >
                <Text style={s.label}>{LANG_LABELS[code] ?? code}</Text>
                {selected && <Ionicons name="checkmark" size={22} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {settings.preferredLanguage && (
          <TouchableOpacity
            style={s.clearButton}
            onPress={() =>
              save({ preferredLanguage: null, preferredDialect: null } as any)
            }
            disabled={saving}
          >
            <Text style={s.clearText}>Reset — let the app detect my language</Text>
          </TouchableOpacity>
        )}

        {settings.preferredDialect && (
          <Text style={s.footnote}>
            Detected dialect: {settings.preferredDialect}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingBottom: 40 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textTertiary,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  section: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: { fontSize: 16, color: colors.text },
  footnote: {
    color: colors.textSecondary,
    fontSize: 13,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  clearButton: {
    marginTop: 24,
    marginHorizontal: 16,
    padding: 14,
    alignItems: "center",
  },
  clearText: { color: colors.primary, fontSize: 15, fontWeight: "500" },
});
