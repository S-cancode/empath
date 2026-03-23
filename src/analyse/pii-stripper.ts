/**
 * Pre-processes user text to strip identifiable information before
 * sending to OpenAI. Removes emails, phone numbers, URLs, names
 * following common identifiers, postcodes, and social media handles.
 *
 * This is a best-effort approach — perfect stripping is not possible.
 * The DPIA documents this as "identifiers removed where detectable."
 */

// Email addresses
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Phone numbers (UK and international)
const PHONE_RE = /(?:\+?\d{1,4}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}\b/g;

// URLs
const URL_RE = /https?:\/\/[^\s]+/gi;

// Social media handles
const HANDLE_RE = /@[A-Za-z0-9_]{1,30}\b/g;

// UK postcodes
const POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi;

// Names following common identifiers (captures the next 1-2 words)
const NAME_PATTERNS = [
  /\b(?:my name is|i'm|i am|call me|they call me|named)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
  /\b(?:my (?:husband|wife|partner|boyfriend|girlfriend|son|daughter|brother|sister|friend|mum|mom|dad|father|mother))\s+([A-Z][a-z]+)/gi,
];

export function stripPII(text: string): string {
  let result = text;

  // Replace names first (before lowercasing)
  for (const pattern of NAME_PATTERNS) {
    result = result.replace(pattern, (match, name) =>
      match.replace(name, "[name]")
    );
  }

  result = result.replace(EMAIL_RE, "[email]");
  result = result.replace(PHONE_RE, (match) => {
    // Only strip if it looks like a real phone number (at least 7 digits)
    const digits = match.replace(/\D/g, "");
    return digits.length >= 7 ? "[phone]" : match;
  });
  result = result.replace(URL_RE, "[url]");
  result = result.replace(HANDLE_RE, "[handle]");
  result = result.replace(POSTCODE_RE, "[postcode]");

  return result;
}
