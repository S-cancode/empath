import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "@/theme/colors";
import { useAuthStore } from "@/stores/auth.store";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { AppBackground } from "@/components/ui/AppBackground";
import { Avatar } from "@/components/ui/Avatar";

export default function ChooseNameScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [customName, setCustomName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const randomName = user?.alias || "Anonymous";

  const handleKeepRandom = async () => {
    await AsyncStorage.setItem("name_chosen", "true");
    router.replace("/(auth)/age-gate");
  };

  const handleSetCustom = async () => {
    const trimmed = customName.trim();
    if (trimmed.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setError("Letters, numbers, and underscores only");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.put("/auth/alias", { alias: trimmed });
      if (user) {
        setUser({ ...user, alias: data.alias });
      }
      await AsyncStorage.setItem("name_chosen", "true");
      router.replace("/(auth)/age-gate");
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const displayName = customName.trim() || randomName;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <AppBackground />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Choose your name</Text>
          <Text style={styles.subtitle}>
            This is how others will see you. You can keep your random name or pick your own.
          </Text>

          <View style={styles.preview}>
            <Avatar alias={displayName} size={72} />
            <Text style={styles.previewName}>{displayName}</Text>
          </View>

          <View style={styles.randomSection}>
            <Text style={styles.sectionLabel}>Your random name</Text>
            <View style={styles.randomCard}>
              <Text style={styles.randomName}>{randomName}</Text>
              <Button title="Keep this name" onPress={handleKeepRandom} />
            </View>
          </View>

          <View style={styles.customSection}>
            <Text style={styles.sectionLabel}>Or choose your own</Text>
            <TextInput
              style={styles.input}
              value={customName}
              onChangeText={(t) => { setCustomName(t); setError(null); }}
              placeholder="Enter a username..."
              placeholderTextColor={colors.textTertiary}
              maxLength={24}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button
              title="Use this name"
              onPress={handleSetCustom}
              loading={loading}
              disabled={customName.trim().length < 2}
              style={{ marginTop: 12 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 28,
  },
  preview: {
    alignItems: "center",
    marginBottom: 32,
  },
  previewName: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    marginTop: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: colors.textTertiary,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  randomSection: {
    marginBottom: 28,
  },
  randomCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  randomName: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    textAlign: "center",
  },
  customSection: {
    paddingBottom: 20,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  error: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.error,
    marginTop: 6,
  },
});
