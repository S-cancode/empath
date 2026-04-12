// Unit tests for the client-side translation display helper. The helper is
// pure TS (no React/React Native imports), so vitest can run it directly via
// tsx even though it lives under the client/ tree. TSC doesn't compile test
// files (see tsconfig.json exclude), so the cross-package import is safe.
import { describe, it, expect } from "vitest";
import {
  resolveDisplay,
  languageLabel,
} from "../../client/src/components/chat/translationDisplay";

describe("languageLabel", () => {
  it("maps known codes to human names", () => {
    expect(languageLabel("en")).toBe("English");
    expect(languageLabel("fr")).toBe("French");
    expect(languageLabel("ja")).toBe("Japanese");
  });
  it("uppercases unknown codes", () => {
    expect(languageLabel("xx")).toBe("XX");
  });
  it("handles null/undefined", () => {
    expect(languageLabel(null)).toBe("another language");
    expect(languageLabel(undefined)).toBe("another language");
  });
});

describe("resolveDisplay", () => {
  it("returns untranslated mode when translated=false", () => {
    const d = resolveDisplay({ content: "Hello", translated: false }, false);
    expect(d.mode).toBe("untranslated");
    expect(d.text).toBe("Hello");
    expect(d.showToggle).toBe(false);
    expect(d.toggleLabel).toBeNull();
  });

  it("returns untranslated mode when originalContent is missing", () => {
    const d = resolveDisplay(
      { content: "Hola", translated: true },
      false,
    );
    expect(d.mode).toBe("untranslated");
    expect(d.showToggle).toBe(false);
  });

  it("returns untranslated mode when content equals originalContent", () => {
    // Backend may emit translated:true with identical text if the model
    // returned the source as-is. We treat that as no-op.
    const d = resolveDisplay(
      { content: "Hola", originalContent: "Hola", translated: true, sourceLanguage: "es" },
      false,
    );
    expect(d.mode).toBe("untranslated");
    expect(d.showToggle).toBe(false);
  });

  it("renders translated text with source-language label by default", () => {
    const d = resolveDisplay(
      {
        content: "Hello friend",
        originalContent: "Salut l'ami",
        translated: true,
        sourceLanguage: "fr",
      },
      false,
    );
    expect(d.mode).toBe("translated");
    expect(d.text).toBe("Hello friend");
    expect(d.showToggle).toBe(true);
    expect(d.toggleLabel).toBe("Translated from French — tap for original");
  });

  it("renders original text when showOriginal is true", () => {
    const d = resolveDisplay(
      {
        content: "Hello friend",
        originalContent: "Salut l'ami",
        translated: true,
        sourceLanguage: "fr",
      },
      true,
    );
    expect(d.mode).toBe("original");
    expect(d.text).toBe("Salut l'ami");
    expect(d.showToggle).toBe(true);
    expect(d.toggleLabel).toBe("Showing original — tap for translation");
  });

  it("falls back to 'another language' when sourceLanguage is null", () => {
    const d = resolveDisplay(
      {
        content: "Hello",
        originalContent: "???",
        translated: true,
        sourceLanguage: null,
      },
      false,
    );
    expect(d.toggleLabel).toBe("Translated from another language — tap for original");
  });
});
