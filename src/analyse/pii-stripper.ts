/**
 * Pre-processes user text to strip identifiable information before
 * sending to OpenAI. Removes emails, phone numbers, URLs, names
 * following common identifiers, postcodes, addresses, government IDs,
 * ages with context, and social media handles.
 *
 * This is a best-effort approach — perfect stripping is not possible.
 * The DPIA documents this as "identifiers removed where detectable."
 */

// Email addresses
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Phone numbers (UK and international) — require at least 7 digits
const PHONE_RE = /(?:\+?\d{1,4}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}\b/g;

// URLs
const URL_RE = /https?:\/\/[^\s]+/gi;

// Social media handles
const HANDLE_RE = /@[A-Za-z0-9_]{1,30}\b/g;

// UK postcodes
const POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi;

// UK National Insurance numbers
const NI_NUMBER_RE = /\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi;

// NHS numbers (10 digits, sometimes with spaces)
const NHS_RE = /\b\d{3}\s?\d{3}\s?\d{4}\b/g;

// Street addresses — "number + street name + road/street/avenue/etc"
const ADDRESS_RE = /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Road|Street|Avenue|Lane|Drive|Close|Way|Place|Crescent|Court|Gardens|Terrace|Grove|Park|Hill|Square|Row|Mews|Walk)\b/gi;

// "I live at/in" followed by a location
const LIVE_AT_RE = /\b(?:i live (?:at|in|on|near))\s+[^.!?,]{3,40}/gi;

// Names following common identifiers (captures the next 1-2 capitalized words)
const NAME_PATTERNS = [
  /\b(?:my name is|i'm|i am|call me|they call me|named)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
  /\b(?:my (?:husband|wife|partner|boyfriend|girlfriend|son|daughter|brother|sister|friend|mum|mom|dad|father|mother|boss|manager|colleague|therapist|counsellor|counselor|doctor|teacher|ex|aunt|uncle|cousin|niece|nephew|grandma|grandpa|nan|granddad))\s+([A-Z][a-z]+)/gi,
];

// Ages with context — "my X year old"
const AGE_CONTEXT_RE = /\bmy\s+\d{1,3}\s*(?:year|yr)[\s-]*old\b/gi;

export function stripPII(text: string): string {
  let result = text;

  // Replace names first (before other patterns could interfere)
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
  result = result.replace(NI_NUMBER_RE, "[ni-number]");
  result = result.replace(NHS_RE, (match) => {
    // Only strip 10-digit sequences (NHS numbers), not shorter numbers
    const digits = match.replace(/\D/g, "");
    return digits.length === 10 ? "[nhs-number]" : match;
  });
  result = result.replace(ADDRESS_RE, "[address]");
  result = result.replace(LIVE_AT_RE, "[location]");
  result = result.replace(AGE_CONTEXT_RE, "[age-ref]");

  return result;
}
