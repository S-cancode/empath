import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { AppBackground } from "@/components/ui/AppBackground";

export default function PrivacyNoticeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <AppBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{"\u2190"} Back</Text>
        </TouchableOpacity>

        <Text style={styles.lastUpdated}>Last updated: 7 March 2026</Text>
        <Text style={styles.title}>Privacy Notice</Text>

        <Text style={styles.sectionTitle}>1. Who We Are</Text>
        <Text style={styles.body}>
          Empath is operated by Empath Ltd, registered at 47 Meadway, London,
          N14 6NJ.{"\n\n"}
          Data protection lead: Dr Rohan Choudhari.{"\n"}
          Contact: privacy@sympathy.app
        </Text>

        <Text style={styles.sectionTitle}>2. What Data We Collect</Text>
        <Text style={styles.body}>
          {"\u2022"} Device identifiers (to create your anonymous account){"\n"}
          {"\u2022"} Email address (optional, if you upgrade your account){"\n"}
          {"\u2022"} Date of birth (to verify you are 18+){"\n"}
          {"\u2022"} Free-text prompts (analysed for matching, then deleted){"\n"}
          {"\u2022"} Anonymised matching data, including numerical representations of your text, topic categories, and match quality scores, used to improve matching accuracy{"\n"}
          {"\u2022"} Chat messages (encrypted at rest){"\n"}
          {"\u2022"} Crisis signposting event logs (recording when safety keywords were detected, without storing the full message){"\n"}
          {"\u2022"} Session ratings{"\n"}
          {"\u2022"} Usage analytics{"\n"}
          {"\u2022"} Age declaration
        </Text>

        <Text style={styles.sectionTitle}>3. Why We Collect It & Legal Basis</Text>
        <Text style={styles.body}>
          We process your data to provide our peer support matching service.
          {"\n\n"}
          {"\u2022"} Account data (email, username): Contract performance (Art. 6(1)(b)){"\n"}
          {"\u2022"} Device identifiers and IP addresses: Legitimate interest (Art. 6(1)(f)){"\n"}
          {"\u2022"} Chat messages: Contract performance (Art. 6(1)(b)){"\n"}
          {"\u2022"} Free-text prompts: Explicit consent for sensitive data (Art. 9(2)(a)){"\n"}
          {"\u2022"} Age verification: Legal obligation (Art. 6(1)(c))
        </Text>

        <Text style={styles.sectionTitle}>4. Who We Share It With</Text>
        <Text style={styles.body}>
          {"\u2022"} Other users (your matched peer, in chat only){"\n"}
          {"\u2022"} AI provider (receives a version of your text with identifying details removed, for matching and safety analysis){"\n"}
          {"\u2022"} Hosting provider (for infrastructure){"\n"}
          {"\u2022"} Law enforcement (if legally compelled)
        </Text>

        <Text style={styles.sectionTitle}>5. How Long We Keep It</Text>
        <Text style={styles.body}>
          {"\u2022"} Free-text prompts: Deleted after matching (within minutes){"\n"}
          {"\u2022"} Anonymised matching data: Up to 180 days, then permanently deleted{"\n"}
          {"\u2022"} Chat messages: Encrypted at rest; retained while conversation is active; automatically deleted 30 days after a conversation is archived or blocked; deleted immediately on account deletion{"\n"}
          {"\u2022"} Crisis signposting logs: 12 months, then deleted{"\n"}
          {"\u2022"} Account data: Retained until account deletion{"\n"}
          {"\u2022"} Device identifiers and IP addresses: Retained for the lifetime of the account; deleted within 30 days of account deletion{"\n"}
          {"\u2022"} Session ratings: Anonymised within 90 days{"\n"}
          {"\u2022"} Usage analytics: Anonymised within 90 days{"\n"}
          {"\u2022"} Terms acceptance: 2 years after account deletion{"\n"}
          {"\u2022"} Consent records: 6 years after account deletion{"\n"}
          {"\u2022"} Report records: 12 months from resolution
        </Text>

        <Text style={styles.sectionTitle}>6. International Transfers</Text>
        <Text style={styles.body}>
          To analyse your text for matching and safety purposes, we send a
          pre-processed version (with identifying details removed) to our AI
          provider, whose servers are located in the United States. This
          transfer is protected by Standard Contractual Clauses. All other data
          is processed and stored within the United Kingdom.
        </Text>

        <Text style={styles.sectionTitle}>7. Your Rights</Text>
        <Text style={styles.body}>
          You have the right to:{"\n\n"}
          {"\u2022"} Access your personal data{"\n"}
          {"\u2022"} Correct inaccurate data{"\n"}
          {"\u2022"} Delete your data (via in-app account deletion){"\n"}
          {"\u2022"} Restrict processing{"\n"}
          {"\u2022"} Data portability{"\n"}
          {"\u2022"} Object to processing{"\n"}
          {"\u2022"} Withdraw consent at any time{"\n"}
          {"\u2022"} Complain to the ICO
        </Text>

        <Text style={styles.sectionTitle}>8. Automated Decision-Making</Text>
        <Text style={styles.body}>
          We use AI to analyse your free-text prompts for the purpose of finding
          a relevant match. This analysis extracts themes and keywords — it does
          NOT diagnose or categorise health conditions. You are never shown to
          your match based on a health label.
        </Text>

        <Text style={styles.sectionTitle}>9. How to Complain</Text>
        <Text style={styles.body}>
          If you are unhappy with how we handle your data, you can complain to
          the Information Commissioner's Office (ICO):{"\n\n"}
          Website: ico.org.uk{"\n"}
          Phone: 0303 123 1113
        </Text>

        <Text style={styles.sectionTitle}>10. Changes to This Policy</Text>
        <Text style={styles.body}>
          We will notify you of material changes via in-app notification. The
          "Last updated" date at the top will reflect the most recent revision.
        </Text>

        <View style={{ height: 60 }} />
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
  backBtn: {
    marginBottom: 16,
  },
  backText: {
    ...typography.body,
    color: colors.primary,
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
});
