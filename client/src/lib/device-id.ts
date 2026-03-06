import { Platform } from "react-native";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "sympathy_device_id";

export async function getDeviceId(): Promise<string> {
  // Try platform-specific stable IDs first
  if (Platform.OS === "ios") {
    const vendorId = await Application.getIosIdForVendorAsync();
    if (vendorId) return vendorId;
  }

  if (Platform.OS === "android") {
    const androidId = Application.getAndroidId();
    if (androidId) return androidId;
  }

  // Fallback: generate and persist a UUID (works in Expo Go / simulators)
  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (stored) return stored;

  const generated = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, generated);
  return generated;
}
