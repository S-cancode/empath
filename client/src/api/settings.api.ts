import { apiClient } from "./client";

export interface TranslationSettings {
  preferredLanguage: string | null;
  preferredDialect: string | null;
  autoTranslateEnabled: boolean;
  languageDetectedAt: string | null;
  supportedLanguages?: string[];
}

export async function getTranslationSettings(): Promise<TranslationSettings> {
  const { data } = await apiClient.get<TranslationSettings>("/settings/translation");
  return data;
}

export async function setTranslationSettings(
  params: Partial<Pick<TranslationSettings, "preferredLanguage" | "preferredDialect" | "autoTranslateEnabled">>,
): Promise<TranslationSettings> {
  const { data } = await apiClient.put<TranslationSettings>("/settings/translation", params);
  return data;
}
