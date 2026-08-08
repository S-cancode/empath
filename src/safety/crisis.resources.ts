export interface CrisisResource {
  name: string;
  phone?: string;
  text?: string;
  url?: string;
  description: string;
  country: string;
}

/**
 * International fallback shown when the user's country is unknown/unsupported,
 * or appended alongside a supported country's list (useful when travelling).
 */
export const internationalResources: CrisisResource[] = [
  {
    name: "Local emergency services",
    description:
      "If you or someone else is in immediate danger, call your local emergency number now.",
    country: "INTL",
  },
  {
    name: "Befrienders Worldwide",
    url: "https://www.befrienders.org",
    description: "Find a free emotional-support helpline in your country.",
    country: "INTL",
  },
  {
    name: "Find A Helpline",
    url: "https://findahelpline.com",
    description: "Free, confidential support lines worldwide — choose your country.",
    country: "INTL",
  },
];

/**
 * Return crisis resources for a country code (ISO-3166 alpha-2). Always
 * includes the international fallback so travellers and unknown locations are
 * covered. Unknown/unsupported country → international fallback only.
 */
// The resource list predates ISO codes and tags UK entries "UK"; map the
// ISO-3166 code GB onto it.
const COUNTRY_ALIASES: Record<string, string> = { GB: "UK" };

export function getCrisisResources(country?: string | null): CrisisResource[] {
  const raw = (country ?? "").toUpperCase();
  const code = COUNTRY_ALIASES[raw] ?? raw;
  const local = crisisResources.filter((r) => r.country === code);
  if (local.length === 0) {
    return internationalResources;
  }
  // Country-specific first, then the international fallback for continuity.
  return [...local, ...internationalResources];
}

export const crisisResources: CrisisResource[] = [
  {
    name: "Emergency Services",
    phone: "999",
    description: "Call 999 if you or someone else is in immediate danger",
    country: "UK",
  },
  {
    name: "Samaritans",
    phone: "116 123",
    url: "https://www.samaritans.org",
    description: "Free 24/7 emotional support for anyone in distress",
    country: "UK",
  },
  {
    name: "NHS Mental Health Crisis Line",
    phone: "111 (option 2)",
    url: "https://www.nhs.uk/mental-health",
    description: "NHS urgent mental health support",
    country: "UK",
  },
  {
    name: "Crisis Text Line",
    text: "Text SHOUT to 85258",
    url: "https://www.giveusashout.org",
    description: "Free 24/7 text-based crisis support",
    country: "UK",
  },
  {
    name: "988 Suicide & Crisis Lifeline",
    phone: "988",
    url: "https://988lifeline.org",
    description: "Free 24/7 support for people in suicidal crisis or emotional distress",
    country: "US",
  },
  {
    name: "Crisis Text Line",
    text: "Text HOME to 741741",
    url: "https://www.crisistextline.org",
    description: "Free 24/7 text-based crisis support",
    country: "US",
  },
];

/** Resources shown when a user is identified as potentially under 18 */
export const childrenResources: CrisisResource[] = [
  {
    name: "Childline",
    phone: "0800 1111",
    url: "https://www.childline.org.uk",
    description: "Free, confidential support for anyone under 19",
    country: "UK",
  },
  {
    name: "YoungMinds",
    phone: "Text YM to 85258",
    url: "https://www.youngminds.org.uk",
    description: "Mental health support for young people",
    country: "UK",
  },
  {
    name: "The Mix",
    phone: "0808 808 4994",
    url: "https://www.themix.org.uk",
    description: "Support for under 25s on any challenge",
    country: "UK",
  },
];
