import React from "react";
import { View, Text, StyleSheet, Modal } from "react-native";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Button } from "@/components/ui/Button";

interface MatchProposalModalProps {
  visible: boolean;
  partnerSummary: string;
  partnerCategory: string;
  onAccept: () => void;
  onDecline: () => void;
  loading?: boolean;
}

export function MatchProposalModal({
  visible,
  partnerSummary,
  partnerCategory,
  onAccept,
  onDecline,
  loading,
}: MatchProposalModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.emoji}>&#x1F91D;</Text>
          <Text style={styles.title}>We found you a match!</Text>

          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{partnerCategory}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>{partnerSummary}</Text>
          </View>

          <Text style={styles.note}>
            Would you like to connect with this person?
          </Text>

          <View style={styles.buttons}>
            <Button
              title="Start chatting"
              onPress={onAccept}
              loading={loading}
              style={{ flex: 1 }}
            />
            <Button
              title="Skip"
              variant="outline"
              onPress={onDecline}
              disabled={loading}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 28,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: "center",
    marginBottom: 16,
  },
  categoryBadge: {
    backgroundColor: colors.primary + "20",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  categoryText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontFamily: "Inter_600SemiBold",
    textTransform: "capitalize",
  },
  summaryCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
    width: "100%",
    marginBottom: 16,
  },
  summaryText: {
    ...typography.body,
    color: colors.text,
    textAlign: "center",
    lineHeight: 24,
    fontStyle: "italic",
  },
  note: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 20,
  },
  buttons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
});
