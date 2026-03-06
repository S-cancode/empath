import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createHash } from "@/lib/hash";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Button } from "@/components/ui/Button";
import { AppBackground } from "@/components/ui/AppBackground";
import { recordConsent } from "@/api/compliance.api";
import { Platform } from "react-native";

const CONSENT_VERSION = "1.0";

const CONSENT_TEXT =
  "To match you with someone experiencing something similar, we analyse the text you write. " +
  "Your text may include information about your health, emotions, or personal circumstances. " +
  "Under UK law, this is considered sensitive personal data.\n\n" +
  "What we do: Analyse your text to find a relevant match, then delete it after matching is complete.\n\n" +
  "What we do NOT do: Diagnose you, categorise your health condition, store your text permanently, " +
  "or share your text with anyone except your matched peer.\n\n" +
  "You can withdraw this consent at any time in Settings, which will disable the matching feature.";

export default function ConsentScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [declined, setDeclined] = useState(false);

  const handleConsent = async (granted: boolean) => {
    setLoading(true);
    try {
      const textHash = await createHash(CONSENT_TEXT);
      await recordConsent({
        consentType: "sensitive_data",
        version: CONSENT_VERSION,
        granted,
        textHash,
        deviceType: Platform.OS,
      });
      await AsyncStorage.setItem("consent_recorded", granted ? "granted" : "declined");
      if (granted) {
        router.replace("/(app)/(tabs)");
      } else {
        setDeclined(true);
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (declined) {
    return (
      <View style={styles.container}>
        <AppBackground />
        <View style={styles.content}>
          <Text style={styles.title}>Consent Declined</Text>
          <Text style={styles.body}>
            You can still use your account, but the matching feature will not be
            available without consent to process sensitive data.{"\n\n"}You can
            change this at any time in Settings.
          </Text>
          <Button
            title="Continue to App"
            onPress={() => router.replace("/(app)/(tabs)")}
            style={{ marginTop: 24 }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.title}>Before you write your first message</Text>

        <Text style={styles.body}>{CONSENT_TEXT}</Text>

        <TouchableOpacity
          style={styles.learnMore}
          onPress={() => router.push("/(auth)/privacy-notice")}
        >
          <Text style={styles.learnMoreText}>Learn more — Privacy Notice</Text>
        </TouchableOpacity>

        <Button
          title="I consent to this processing"
          onPress={() => handleConsent(true)}
          loading={loading}
          style={{ marginTop: 32 }}
        />

        <TouchableOpacity
          style={styles.declineLink}
          onPress={() => handleConsent(false)}
          disabled={loading}
        >
          <Text style={styles.declineLinkText}>I do not consent</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 80,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    marginBottom: 24,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 26,
  },
  learnMore: {
    marginTop: 20,
  },
  learnMoreText: {
    ...typography.body,
    color: colors.primary,
    textDecorationLine: "underline",
  },
  declineLink: {
    alignSelf: "center",
    paddingVertical: 16,
    marginBottom: 40,
  },
  declineLinkText: {
    ...typography.body,
    color: colors.textTertiary,
    textDecorationLine: "underline",
  },
});
