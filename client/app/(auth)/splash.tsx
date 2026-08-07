import React, { useEffect } from "react";
import { View, Text, Image, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { useAuthStore } from "@/stores/auth.store";
import { routeAfterAuth } from "@/lib/post-auth-routing";
import { AppBackground } from "@/components/ui/AppBackground";

/**
 * Session gate: an existing signed-in session continues through the
 * compliance chain; everyone else goes to Sign in with Apple. The old
 * silent anonymous auto-registration is gone — identity is durable now.
 */
export default function SplashScreen() {
  const router = useRouter();
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!isHydrated) return;
    if (accessToken) {
      routeAfterAuth(router).catch(() => router.replace("/(auth)/sign-in"));
    } else {
      router.replace("/(auth)/sign-in");
    }
  }, [isHydrated, accessToken]);

  return (
    <View style={styles.container}>
      <AppBackground />
      <Image
        source={require("../../assets/empath-logo-text.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.subtitle}>Peer support, pseudonymous by design</Text>
      <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
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
  logo: {
    width: 260,
    height: 80,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 8,
  },
});
