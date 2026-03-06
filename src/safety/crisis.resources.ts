export interface CrisisResource {
  name: string;
  phone?: string;
  text?: string;
  url?: string;
  description: string;
  country: string;
}

export const crisisResources: CrisisResource[] = [
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
