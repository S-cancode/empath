import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useAuthStore } from "@/stores/auth.store";
import { apiClient } from "@/api/client";

// Don't show in-app alerts — Socket.IO handles real-time updates
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function useRegisterPushToken() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const registered = useRef(false);

  useEffect(() => {
    if (!accessToken || registered.current) return;

    (async () => {
      if (!Device.isDevice) return;

      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") return;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;
      const tokenData = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );

      await apiClient.post("/notifications/push-token", {
        pushToken: tokenData.data,
      });

      registered.current = true;
    })().catch((err) => {
      console.error("Push token registration failed:", err);
    });
  }, [accessToken]);
}
