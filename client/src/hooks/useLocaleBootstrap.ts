import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { getTranslationSettings, setTranslationSettings } from "@/api/settings.api";

const SUPPORTED = new Set([
  "en", "es", "fr", "de", "pt", "it", "zh", "ja", "ko", "ar", "hi", "ru",
]);

function deviceLocale(): { language: string | null; dialect: string | null } {
  try {
    // Intl is available in Hermes on Expo SDK 52+.
    const full = Intl.DateTimeFormat().resolvedOptions().locale; // e.g. "en-US"
    if (!full) return { language: null, dialect: null };
    const lang = full.split(/[-_]/)[0]?.toLowerCase();
    if (!lang || !SUPPORTED.has(lang)) return { language: null, dialect: null };
    const dialect = /^[a-z]{2,3}[-_][a-zA-Z]{2,4}/.test(full)
      ? full.replace("_", "-").slice(0, 20)
      : null;
    return { language: lang, dialect };
  } catch {
    return { language: null, dialect: null };
  }
}

/**
 * Seeds the user's preferredLanguage + dialect from the device locale
 * on first authenticated mount, if and only if the server reports they
 * don't already have one set. Idempotent — runs at most once per app
 * session, and the backend is the source of truth (it always wins).
 */
export function useLocaleBootstrap() {
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    (async () => {
      try {
        const current = await getTranslationSettings();
        if (cancelled) return;
        if (current.preferredLanguage) return; // user already set or inferred

        const local = deviceLocale();
        if (!local.language) return;

        await setTranslationSettings({
          preferredLanguage: local.language,
          preferredDialect: local.dialect,
          autoTranslateEnabled: true,
        });
      } catch {
        // best-effort; silent failure is fine
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);
}
