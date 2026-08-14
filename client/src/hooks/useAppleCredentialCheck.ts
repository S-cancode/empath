import { useEffect, useRef } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/auth.store";
import { APPLE_USER_ID_KEY, shouldForceSignOut } from "@/lib/apple-credential";

/**
 * Defence-in-depth: on launch and whenever the app returns to the foreground,
 * ask Apple for the current credential state of the signed-in Apple user. If
 * Apple reports REVOKED or NOT_FOUND, clear the local session and route to a
 * clean sign-in. The backend (Apple server-to-server notification) remains the
 * authoritative enforcement — this just avoids a stale local session.
 */
export function useAppleCredentialCheck(): void {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const checking = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    async function check() {
      if (checking.current || !useAuthStore.getState().user) return;
      checking.current = true;
      try {
        const appleUserId = await SecureStore.getItemAsync(APPLE_USER_ID_KEY);
        if (!appleUserId) return;
        const state = await AppleAuthentication.getCredentialStateAsync(appleUserId);
        if (shouldForceSignOut(state as unknown as number)) {
          await SecureStore.deleteItemAsync(APPLE_USER_ID_KEY);
          await logout();
          router.replace("/(auth)/splash");
        }
      } catch {
        // Never sign the user out on a transient error — backend is authoritative.
      } finally {
        checking.current = false;
      }
    }

    check();
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") check();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
