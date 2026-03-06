import React from "react";
import { View, Text, StyleSheet, Modal, Linking } from "react-native";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Button } from "@/components/ui/Button";
import type { CrisisResource } from "@/types/socket";

interface CrisisAlertProps {
  visible: boolean;
  resources: CrisisResource[];
  onDismiss: () => void;
}

export function CrisisAlert({ visible, resources, onDismiss }: CrisisAlertProps) {
  return (
    <Modal visible={visible} animationType="fade">
      <View style={styles.container}>
        <Text style={styles.title}>You Are Not Alone</Text>
        <Text style={styles.subtitle}>
          We noticed you might be going through a difficult time. Please reach
          out to one of these resources:
        </Text>

        {resources.map((r, i) => (
          <View key={i} style={styles.resource}>
            <Text style={styles.resourceName}>{r.name}</Text>
            {r.phone && (
              <Button
                title={`Call ${r.phone}`}
                variant="outline"
                onPress={() => Linking.openURL(`tel:${r.phone}`)}
                style={{ marginTop: 4 }}
              />
            )}
            {r.url && (
              <Button
                title="Visit Website"
                variant="secondary"
                onPress={() => Linking.openURL(r.url!)}
                style={{ marginTop: 4 }}
              />
            )}
          </View>
        ))}

        <Button
          title="I'm okay, close"
          variant="secondary"
          onPress={onDismiss}
          style={{ marginTop: 24 }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 24,
    justifyContent: "center",
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 32,
  },
  resource: {
    backgroundColor: colors.borderLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  resourceName: {
    ...typography.h3,
    color: colors.text,
  },
});
