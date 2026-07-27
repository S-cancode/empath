import axios from "axios";
import { useAuthStore } from "@/stores/auth.store";
import { setTokens } from "@/lib/secure-storage";
import { getDeviceId } from "@/lib/device-id";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10_000,
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Token refresh on 401
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) throw new Error("No refresh token");

  // Use a raw axios call to avoid interceptor loop
  const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
    `${API_URL}/auth/refresh`,
    { refreshToken }
  );

  await setTokens(data.accessToken, data.refreshToken);
  useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

// Last-resort recovery for a dead refresh token (expired after 7 idle days or
// invalidated server-side). Re-runs first-launch auth: /auth/anonymous looks
// the account up by device ID, so this restores the SAME user with fresh
// tokens instead of surfacing 401s on every request forever.
async function reauthenticate(): Promise<string> {
  const deviceId = await getDeviceId();
  const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
    `${API_URL}/auth/anonymous`,
    { deviceId }
  );
  await setTokens(data.accessToken, data.refreshToken);
  useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      // Serialize concurrent refresh calls
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken()
          .catch(async () => {
            try {
              return await reauthenticate();
            } catch (reauthErr) {
              // Session is unrecoverable (e.g. offline). Clear the dead
              // tokens so the root layout routes to splash for a clean start.
              await useAuthStore.getState().logout().catch(() => undefined);
              throw reauthErr;
            }
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      const newToken = await refreshPromise;
      original.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(original);
    }
    return Promise.reject(error);
  }
);

export { API_URL };
