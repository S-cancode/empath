import { apiClient } from "./client";

export async function confirmAge(dateOfBirth: string): Promise<{ confirmed: boolean }> {
  const { data } = await apiClient.post<{ confirmed: boolean }>(
    "/compliance/age-confirm",
    { dateOfBirth }
  );
  return data;
}

export async function acceptTerms(termsVersion: string, appVersion?: string): Promise<{ id: string }> {
  const { data } = await apiClient.post<{ id: string }>(
    "/compliance/terms/accept",
    { termsVersion, appVersion }
  );
  return data;
}

export async function recordConsent(params: {
  consentType: string;
  version: string;
  granted: boolean;
  textHash: string;
  appVersion?: string;
  deviceType?: string;
}): Promise<{ id: string }> {
  const { data } = await apiClient.post<{ id: string }>(
    "/compliance/consent",
    params
  );
  return data;
}

export async function withdrawConsent(): Promise<void> {
  await apiClient.post("/compliance/consent/withdraw");
}

export type AppleRevocation = "revoked" | "failed" | "unavailable" | "not_applicable";

export async function deleteAccount(): Promise<{ appleRevocation: AppleRevocation }> {
  const { data } = await apiClient.delete<{ appleRevocation?: AppleRevocation }>(
    "/compliance/account"
  );
  return { appleRevocation: data?.appleRevocation ?? "not_applicable" };
}
