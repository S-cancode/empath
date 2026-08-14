# Empath — Privacy Policy (production-ready public copy)

> **MANUAL EXTERNAL ACTION REQUIRED.** The public policy at
> https://www.empathapp.co.uk/privacy is stale (it references Vercel, Supabase,
> Resend and out-of-date flows). The website source is **not** in this
> repository, so it cannot be updated from here. Replace the live page with the
> copy below and then verify the live URL. Until then, do not represent the
> public page as updated. Keep this file in sync with the in-app Privacy Notice
> (`client/app/(auth)/privacy-notice.tsx`).

_Last updated: 14 August 2026_

## 1. Who we are
Empath is operated by Empath Ltd, 47 Meadway, London, N14 6NJ, United Kingdom.
Data protection lead: Dr Rohan Choudhari. Contact: **help@empathapp.co.uk**.

## 2. What we collect
- Sign in with Apple identifier (account creation and security)
- Device identifiers (safety enforcement — e.g. blocks and bans)
- Email address (from Apple; may be an Apple private-relay address)
- Date of birth (to verify you are 18+)
- Free-text matching prompts (analysed for matching, then deleted)
- Anonymised matching data (numeric representations of your text, topic
  categories, match-quality scores)
- Chat messages (text and voice notes), encrypted at rest
- Crisis-signposting event logs (that a safety keyword was detected, without the
  full message)
- Session ratings and basic usage analytics

## 3. Who we share it with, and the data that leaves the UK
We use a small number of processors. The only routine transfer outside the UK is
to our AI provider, **OpenAI (servers in the United States)**, protected by
Standard Contractual Clauses:

| Processor | What we send | Why |
|---|---|---|
| **OpenAI (US)** | (a) an identity-stripped version of your matching text; (b) **every chat message you send**, to the moderation service, before it is delivered to your peer; (c) the audio of any voice note you send — transcribed for a safety check, then the transcript is discarded; (d) **only if you enable auto-translate**, your chat messages for translation | Matching analysis; pre-delivery safety moderation of text and voice; optional translation |
| **Apple** | Sign in with Apple identifier, optional relay email | Account creation and security |
| **Sentry (EU ingest)** | Crash/diagnostic data (no message content) | Reliability |
| **Expo / Apple Push (APNs)** | Device push token | Neutral "new message" notifications (no message content) |
| **Railway** | Encrypted application data | Hosting (backend/database) |

We also share a reported conversation with our trained moderators (limited,
logged access), and data with law enforcement where legally compelled.

Empath can technically read message content (it is encrypted in transit and at
rest, but **not** end-to-end encrypted) — this is what makes pre-delivery
moderation, crisis signposting and reporting possible. This is disclosed in the
app.

## 4. How long we keep it
- Free-text prompts: deleted after matching (within minutes)
- Anonymised matching data: up to 180 days
- Chat messages (incl. voice notes): encrypted at rest, auto-deleted after 7
  days; retained longer only while under an active report or safety review;
  deleted immediately on account deletion. Voice-safety transcripts are never
  stored.
- Translated text (auto-translate users only): encrypted cache up to 24 hours
- Crisis-signposting logs: 12 months
- Device identifiers / IP: lifetime of the account, deleted within 30 days of
  deletion
- After account deletion, we retain only what law requires: terms-acceptance
  records (2 years), consent records (6 years), report records (until their own
  retention period expires). Everything else is deleted within 30 days.

## 5. Sign in with Apple and account deletion
You can delete your account in-app (Profile → Delete Account). We erase your
personal data immediately (subject to the legal-retention items above) and
attempt to **revoke Sign in with Apple access** on Apple's side. If we cannot
complete that automatically, the app tells you and gives you the manual steps
(Settings → your name → Sign in with Apple → Empath → Stop Using Apple ID). We
never tell you Apple access was revoked when it was not.

## 6. Legal bases (UK GDPR)
Account data: contract (Art. 6(1)(b)). Device identifiers/IP: legitimate
interest (Art. 6(1)(f)). Chat messages: contract. Free-text prompts and other
special-category data: explicit consent (Art. 9(2)(a)). Age verification: legal
obligation (Art. 6(1)(c)).

## 7. Provider retention / zero-data-retention
We are seeking written confirmation of OpenAI's data-processing terms and
zero-data-retention for the moderation, transcription and translation endpoints.
Until confirmed, we do not claim providers immediately delete inputs.

## 8. Your rights
Access, rectification, erasure, restriction, portability, objection, and
withdrawal of consent. Contact **help@empathapp.co.uk**. You can complain to the
ICO (ico.org.uk, 0303 123 1113).

## 9. Changes
We will notify you of material changes in-app and update the "Last updated" date.
