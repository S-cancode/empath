/**
 * Create a SHA-256 hash of a string.
 * Uses the SubtleCrypto Web API available in React Native.
 */
export async function createHash(text: string): Promise<string> {
  // expo-crypto is available in Expo SDK 54
  const { digestStringAsync, CryptoDigestAlgorithm } = await import("expo-crypto");
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, text);
}
