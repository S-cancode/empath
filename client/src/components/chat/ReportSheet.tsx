import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Button } from "@/components/ui/Button";

const REASONS = [
  { id: "harassment", label: "Harassment or Bullying" },
  { id: "self_harm_encouragement", label: "Encouraging Self-Harm" },
  { id: "sexual_content", label: "Sexual Content" },
  { id: "spam_scam", label: "Spam or Scam" },
  { id: "medical_advice", label: "Giving Medical Advice" },
  { id: "illegal_content", label: "Illegal Content" },
  { id: "underage_user", label: "May Be Under 18" },
  { id: "other", label: "Other" },
] as const;

interface ReportSheetProps {
  visible: boolean;
  partnerName: string;
  onDismiss: () => void;
  onSubmit: (reason: string, details?: string) => void;
  loading?: boolean;
}

export function ReportSheet({
  visible,
  partnerName,
  onDismiss,
  onSubmit,
  loading,
}: ReportSheetProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");

  const handleSubmit = () => {
    if (!selectedReason) return;
    onSubmit(selectedReason, details.trim() || undefined);
    setSelectedReason(null);
    setDetails("");
  };

  const handleDismiss = () => {
    setSelectedReason(null);
    setDetails("");
    onDismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />
          <Text style={styles.title}>Report {partnerName}</Text>
          <Text style={styles.description}>
            Select a reason for your report. We take safety seriously and will
            review this promptly.
          </Text>

          <Text style={styles.sectionLabel}>Reason</Text>
          <View style={styles.reasonList}>
            {REASONS.map((reason) => {
              const selected = selectedReason === reason.id;
              return (
                <TouchableOpacity
                  key={reason.id}
                  style={[styles.reason, selected && styles.reasonSelected]}
                  onPress={() => setSelectedReason(reason.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.reasonText,
                      selected && styles.reasonTextSelected,
                    ]}
                  >
                    {reason.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedReason && (
            <TextInput
              style={styles.input}
              placeholder="Additional details (optional)"
              placeholderTextColor={colors.textTertiary}
              value={details}
              onChangeText={setDetails}
              multiline
              maxLength={1000}
            />
          )}

          <View style={styles.actions}>
            <Button
              title="Submit Report"
              variant="danger"
              onPress={handleSubmit}
              loading={loading}
              disabled={!selectedReason}
              style={{ flex: 1 }}
            />
            <Button
              title="Cancel"
              variant="outline"
              onPress={handleDismiss}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    marginBottom: 4,
  },
  description: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  reasonList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  reason: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.borderLight,
  },
  reasonSelected: {
    backgroundColor: colors.error,
  },
  reasonText: {
    ...typography.bodySmall,
    color: colors.text,
  },
  reasonTextSelected: {
    color: "#FFFFFF",
  },
  input: {
    ...typography.bodySmall,
    color: colors.text,
    backgroundColor: colors.borderLight,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
});
