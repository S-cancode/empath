/**
 * Centralised, honest account-deletion copy. The server deliberately retains a
 * few records after deletion for legal/safeguarding reasons — terms-acceptance
 * (2 years), consent records (6 years), and safety/report records (their own
 * retention period). The UI must NOT claim "all data / all records" are deleted.
 *
 * Kept dependency-free so it can be asserted in tests.
 */

export const DELETION_CONFIRM_TITLE = "Delete Account";

export const DELETION_CONFIRM_BODY =
  "This permanently deletes your account, profile and conversation history. " +
  "A few records we're legally required to keep — your age and terms " +
  "acceptance, your consent history, and any safety reports — are retained for " +
  "limited periods and then deleted. This can't be undone.";

export const DELETION_DONE_TITLE = "Account Deleted";

export const DELETION_DONE_BODY =
  "Your account and personal data have been deleted. Only the limited legal and " +
  "safety records noted earlier are kept, and only for their required retention " +
  "period.";

// Appended when Apple access could not be revoked automatically (legacy account
// or a transient Apple error) — never claims Apple access was revoked.
export const DELETION_DONE_APPLE_MANUAL_SUFFIX =
  " To also stop Sign in with Apple for Empath, open the Settings app → tap your " +
  "name → Sign in with Apple → Empath → Stop Using Apple ID.";
