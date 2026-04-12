// Pure logic backing the MessageBubble translation UX. Kept as a separate
// module so we can unit-test it without a React Native renderer.

export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
  ru: "Russian",
};

export function languageLabel(code: string | null | undefined): string {
  if (!code) return "another language";
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

export interface TranslationFields {
  content: string;
  originalContent?: string;
  translated?: boolean;
  sourceLanguage?: string | null;
}

export interface DisplayDecision {
  text: string;
  showToggle: boolean;
  toggleLabel: string | null;
  // Telemetry/debug: which view are we showing right now?
  mode: "translated" | "original" | "untranslated";
}

/**
 * Given a message's translation fields and whether the user has tapped to
 * reveal the source, decide what to render:
 * - `text`: the string to put in the bubble.
 * - `showToggle`: whether to render the "tap to view original/translation" affordance.
 * - `toggleLabel`: the affordance copy. Null when no toggle is shown.
 * - `mode`: which view is active.
 */
export function resolveDisplay(
  fields: TranslationFields,
  showOriginal: boolean,
): DisplayDecision {
  const hasTranslation =
    fields.translated === true &&
    typeof fields.originalContent === "string" &&
    fields.originalContent.length > 0 &&
    fields.originalContent !== fields.content;

  if (!hasTranslation) {
    return {
      text: fields.content,
      showToggle: false,
      toggleLabel: null,
      mode: "untranslated",
    };
  }

  if (showOriginal) {
    return {
      text: fields.originalContent!,
      showToggle: true,
      toggleLabel: "Showing original — tap for translation",
      mode: "original",
    };
  }

  const src = languageLabel(fields.sourceLanguage);
  return {
    text: fields.content,
    showToggle: true,
    toggleLabel: `Translated from ${src} — tap for original`,
    mode: "translated",
  };
}
