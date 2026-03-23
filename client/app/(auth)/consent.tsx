import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, type NativeSyntheticEvent, type NativeScrollEvent, type LayoutChangeEvent } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createHash } from "@/lib/hash";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Button } from "@/components/ui/Button";
import { AppBackground } from "@/components/ui/AppBackground";
import { recordConsent } from "@/api/compliance.api";
import { Platform } from "react-native";

const CONSENT_VERSION = "1.1";

const CONSENT_TEXT =
  "To match you with someone experiencing something similar, we analyse the text you write.\n\n" +
  "Your text may include information about your health, emotions, or personal circumstances. " +
  "Under UK law, this is considered sensitive personal data.\n\n" +
  "What we do:\n" +
  "\u2022 Analyse your text to find a relevant match, then delete it after matching is complete\n" +
  "\u2022 To analyse your text, we send a version of it with identifying details removed to our AI provider, whose servers are located in the United States\n" +
  "\u2022 We may review anonymised samples of text to improve our matching and safety systems\n\n" +
  "What we do NOT do:\n" +
  "\u2022 Diagnose you or categorise your health condition\n" +
  "\u2022 Store your original text permanently\n" +
  "\u2022 Share your text with anyone except your matched peer\n\n" +
  "You can withdraw this consent at any time in Settings, which will disable the matching feature and trigger deletion of your retained data.";

export default function ConsentScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (scrolledToBottom) return;
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (isAtBottom) setScrolledToBottom(true);
  }, [scrolledToBottom]);

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
        onScroll={handleScroll}
        scrollEventThrottle={100}
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
          disabled={!scrolledToBottom}
          style={{ marginTop: 32, opacity: scrolledToBottom ? 1 : 0.5 }}
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
