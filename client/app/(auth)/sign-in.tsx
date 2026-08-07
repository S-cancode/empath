import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { getDeviceId } from "@/lib/device-id";
import { createAnonymousUser, signInWithApple } from "@/api/auth.api";
import { setTokens } from "@/lib/secure-storage";
import { useAuthStore } from "@/stores/auth.store";
import { routeAfterAuth } from "@/lib/post-auth-routing";
import { Button } from "@/components/ui/Button";
import { AppBackground } from "@/components/ui/AppBackground";
import type { AuthResponse } from "@/types/api";

export default function SignInScreen() {
  const router = useRouter();
  const { setTokens: storeSetTokens, setUser } = useAuthStore();
  const [appleAvailable, setAppleAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  async function completeSignIn(response: AuthResponse) {
    await setTokens(response.accessToken, response.refreshToken);
    storeSetTokens(response.accessToken, response.refreshToken);
    setUser({ id: response.user.id, alias: response.user.alias, tier: "free" });
    await routeAfterAuth(router);
  }

  async function handleApplePress() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!credential.identityToken) {
        throw new Error("Apple did not return an identity token. Please try again.");
      }
      const deviceId = await getDeviceId();
      const response = await signInWithApple(credential.identityToken, deviceId);
      await completeSignIn(response);
    } catch (err: any) {
      // User dismissed the Apple sheet — not an error.
      if (err?.code === "ERR_REQUEST_CANCELED") return;
      const serverMessage = err?.response?.data?.error;
      setError(serverMessage ?? err?.message ?? "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Development-only fallback (Expo Go / simulators without an Apple ID).
  // The production server rejects anonymous auth, so this cannot ship a
  // disposable-identity path to real users.
  async function handleDevAnonymous() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const deviceId = await getDeviceId();
      const response = await createAnonymousUser(deviceId);
      await completeSignIn(response);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <AppBackground />
      <Image
        source={require("../../assets/empath-logo-text.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.subtitle}>Peer support, pseudonymous by design</Text>
      <Text style={styles.explainer}>
        Sign in with Apple keeps your account secure and recoverable. Other
        people on Empath only ever see your chosen nickname — never your name,
        email, or Apple ID.
      </Text>

      {appleAvailable === null && (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
      )}

      {appleAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={styles.appleButton}
          onPress={handleApplePress}
        />
      )}

      {appleAvailable === false && !__DEV__ && (
        <Text style={styles.errorText}>
          Sign in with Apple isn't available on this device. Empath requires it
          to keep the community safe.
        </Text>
      )}

      {__DEV__ && (
        <Button
          title="Continue without Apple (dev only)"
          variant="secondary"
          onPress={handleDevAnonymous}
          style={{ marginTop: 16 }}
        />
      )}

      {busy && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 16 }} />}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
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
  explainer: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 16,
    marginBottom: 24,
    maxWidth: 320,
  },
  appleButton: {
    width: 280,
    height: 48,
    marginTop: 8,
  },
  errorContainer: {
    marginTop: 24,
    alignItems: "center",
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    textAlign: "center",
    marginTop: 16,
    maxWidth: 300,
  },
});
