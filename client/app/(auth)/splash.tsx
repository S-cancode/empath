import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { getDeviceId } from "@/lib/device-id";
import { createAnonymousUser } from "@/api/auth.api";
import { setTokens } from "@/lib/secure-storage";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/Button";
import { AppBackground } from "@/components/ui/AppBackground";

export default function SplashScreen() {
  const router = useRouter();
  const { setTokens: storeSetTokens, setUser } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const authenticate = async () => {
    setLoading(true);
    setError(null);
    try {
      const deviceId = await getDeviceId();
      const response = await createAnonymousUser(deviceId);

      await setTokens(response.accessToken, response.refreshToken);
      storeSetTokens(response.accessToken, response.refreshToken);
      setUser({
        id: response.user.id,
        alias: response.user.alias,
        tier: "free",
      });

      // Check compliance state and route accordingly
      const [ageConfirmed, termsVersion, consentRecorded] = await Promise.all([
        AsyncStorage.getItem("age_confirmed"),
        AsyncStorage.getItem("terms_accepted_version"),
        AsyncStorage.getItem("consent_recorded"),
      ]);

      if (!ageConfirmed) {
        router.replace("/(auth)/age-gate");
      } else if (!termsVersion) {
        router.replace("/(auth)/terms");
      } else if (!consentRecorded) {
        router.replace("/(auth)/consent");
      } else {
        router.replace("/(app)/(tabs)");
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    authenticate();
  }, []);

  return (
    <View style={styles.container}>
      <AppBackground />
      <Text style={styles.title}>Sympathy</Text>
      <Text style={styles.subtitle}>Anonymous peer support</Text>

      {loading && <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Try Again" onPress={authenticate} style={{ marginTop: 16 }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    fontSize: 36,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 8,
  },
  errorContainer: {
    marginTop: 32,
    alignItems: "center",
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    textAlign: "center",
  },
});
