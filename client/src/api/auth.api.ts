import axios from "axios";
import type { AuthResponse, TokenResponse } from "@/types/api";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

// Use raw axios for auth calls (no interceptor needed)
export async function createAnonymousUser(
  deviceId: string
): Promise<AuthResponse> {
  const { data } = await axios.post<AuthResponse>(
    `${API_URL}/auth/anonymous`,
    { deviceId }
  );
  return data;
}

export async function signInWithApple(
  identityToken: string,
  deviceId: string,
  authorizationCode?: string | null
): Promise<AuthResponse> {
  const { data } = await axios.post<AuthResponse>(`${API_URL}/auth/apple`, {
    identityToken,
    deviceId,
    // Sent when Apple provides it, so the server can exchange it for a
    // revocable refresh token (used to revoke Apple access on deletion).
    ...(authorizationCode ? { authorizationCode } : {}),
  });
  return data;
}

export async function refreshTokens(
  refreshToken: string
): Promise<TokenResponse> {
  const { data } = await axios.post<TokenResponse>(
    `${API_URL}/auth/refresh`,
    { refreshToken }
  );
  return data;
}
