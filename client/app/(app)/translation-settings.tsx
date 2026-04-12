import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from "react-native";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import { getTranslationSettings, setTranslationSettings, TranslationSettings } from "@/api/settings.api";

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
              onValueChange={(v) => save({ autoTranslateEnabled: v })}
              disabled={saving}
            />
          </View>
          <Text style={s.footnote}>
            When on, incoming messages from people you talk with are translated into your
            preferred language. Your outgoing messages are delivered in the language you
            wrote them in and then translated into whatever language the recipient reads in.
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
