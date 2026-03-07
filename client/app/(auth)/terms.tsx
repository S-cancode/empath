import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Button } from "@/components/ui/Button";
import { AppBackground } from "@/components/ui/AppBackground";
import { acceptTerms } from "@/api/compliance.api";

const TERMS_VERSION = "1.1";

export default function TermsScreen() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (!accepted) return;
    setLoading(true);
    try {
      await acceptTerms(TERMS_VERSION);
      await AsyncStorage.setItem("terms_accepted_version", TERMS_VERSION);
      router.replace("/(auth)/consent");
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.lastUpdated}>Last updated: 1 March 2026</Text>
        <Text style={styles.title}>Terms of Service</Text>

        <Text style={styles.sectionTitle}>1. What This Service Is</Text>
        <Text style={styles.body}>
          Empath is a peer connection platform for people experiencing similar
          life challenges. It is NOT therapy, NOT medical advice, and NOT a
          crisis service. Conversations are with other users, not professionals.
        </Text>

        <Text style={styles.sectionTitle}>2. Eligibility</Text>
        <Text style={styles.body}>
          You must be 18 or older to use this service.
        </Text>

        <Text style={styles.sectionTitle}>3. Community Rules</Text>
        <Text style={styles.body}>
          The following are prohibited:{"\n"}{"\n"}
          {"\u2022"} No illegal content{"\n"}
          {"\u2022"} No encouraging self-harm or suicide{"\n"}
          {"\u2022"} No harassment, bullying, or threats{"\n"}
          {"\u2022"} No sexual or romantic solicitation{"\n"}
          {"\u2022"} No providing medical, therapeutic, or clinical advice{"\n"}
          {"\u2022"} No sharing personal contact information{"\n"}
          {"\u2022"} No impersonation{"\n"}
          {"\u2022"} No spam or commercial solicitation
        </Text>

        <Text style={styles.sectionTitle}>4. Moderation & Enforcement</Text>
        <Text style={styles.body}>
          We may warn, suspend, or permanently ban accounts that violate these
          rules.
        </Text>

        <Text style={styles.sectionTitle}>5. Reporting</Text>
        <Text style={styles.body}>
          You can report content or users using the in-app report function.
        </Text>

        <Text style={styles.sectionTitle}>6. Complaints</Text>
        <Text style={styles.body}>
          To make a complaint about how we handled a report or moderation
          decision, contact complaints@empath.app. We will respond within 14
          days.
        </Text>

        <Text style={styles.sectionTitle}>7. Disclaimer</Text>
        <Text style={styles.body}>
          Conversations on this platform are with other users, not
          professionals. Nothing said on this platform constitutes medical
          advice, diagnosis, or treatment. We are not responsible for the
          content of conversations between users.
        </Text>

        <Text style={styles.sectionTitle}>8. Privacy</Text>
        <Text style={styles.body}>
          Your use of Empath is also governed by our Privacy Notice, available
          via the link below. By using the matching feature, you will be asked
          to provide explicit consent for the processing of sensitive personal
          data as described in our consent screen.
        </Text>

        <Text style={styles.sectionTitle}>9. Your Content</Text>
        <Text style={styles.body}>
          You retain ownership of the text you submit. By using Empath, you
          grant us a limited licence to process your text for the purposes
          described in our Privacy Notice, including matching, safety
          assessment, and moderation.
        </Text>

        <Text style={styles.sectionTitle}>10. Account Termination</Text>
        <Text style={styles.body}>
          You may delete your account at any time through the Settings menu. We
          may terminate or suspend your account if you violate these Terms, as
          described in Section 4.
        </Text>

        <Text style={styles.sectionTitle}>11. Limitation of Liability</Text>
        <Text style={styles.body}>
          Nothing in these Terms excludes or limits our liability for death or
          personal injury caused by our negligence, fraud or fraudulent
          misrepresentation, or any other liability that cannot be excluded or
          limited under English law. Subject to the foregoing, to the fullest
          extent permitted by law, Empath shall not be liable for any indirect,
          incidental, or consequential damages arising from your use of the
          service.
        </Text>

        <Text style={styles.sectionTitle}>12. Changes to Terms</Text>
        <Text style={styles.body}>
          We will notify you of material changes via in-app notification. Your
          continued use after changes constitutes acceptance.
        </Text>

        <Text style={styles.sectionTitle}>13. Governing Law</Text>
        <Text style={styles.body}>
          These terms are governed by the laws of England and Wales.
        </Text>

        <TouchableOpacity
          style={styles.privacyLink}
          onPress={() => router.push("/(auth)/privacy-notice")}
        >
          <Text style={styles.privacyLinkText}>View Privacy Notice</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setAccepted(!accepted)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
            {accepted && <Text style={styles.checkmark}>{"\u2713"}</Text>}
          </View>
          <Text style={styles.checkboxLabel}>
            I accept the Terms of Service
          </Text>
        </TouchableOpacity>

        <Button
          title="Continue"
          onPress={handleAccept}
          loading={loading}
          disabled={!accepted}
          style={{ marginTop: 16, marginBottom: 40 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
  },
  lastUpdated: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: 8,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    marginBottom: 24,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginTop: 20,
    marginBottom: 8,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  privacyLink: {
    marginTop: 24,
    alignSelf: "center",
  },
  privacyLinkText: {
    ...typography.body,
    color: colors.primary,
    textDecorationLine: "underline",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "bold",
  },
  checkboxLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
});
