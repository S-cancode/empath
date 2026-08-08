# App Review Notes — Empath

Empath is an adults-only (18+) peer emotional-support app: users are matched by AI analysis of a free-text prompt and talk 1:1 via text and optional voice notes. Public presence is pseudonymous; accounts are anchored to Sign in with Apple so safety enforcement (bans, blocks, reports) is durable.

## Sign in
- Tap **Sign in with Apple** on launch. No email/password to create. Reviewers may use their own Apple ID.
- After sign-in: age gate (18+), Terms, and a sensitive-data consent screen. All three are enforced server-side.

## What a reviewer can verify in ~5 minutes
1. **Verified login** via Sign in with Apple; pseudonymous nickname shown to peers.
2. **Age & consent**: under-18 DOB is blocked; matching/messaging require consent.
3. **Structured matching**: you write what you're going through; matching is AI-similarity + hard compatibility filters (not random/anonymous pairing). No public search, feed, or browsable profiles.
4. **Text chat** with a matched peer.
5. **Pre-delivery moderation**: harmful text is blocked before the recipient sees it (neutral rejection to sender). Voice notes are transcribed and safety-checked before delivery; the transcript is discarded after the check.
6. **Crisis signposting**: crisis phrases show help resources privately to the affected user (country-aware).
7. **Report a message** (long-press → Report) — text or an exact voice note.
8. **Block** a user (directional; auto-block on report).
9. **Archive/end** a conversation.
10. **Account deletion** in Profile (right to erasure) — in-app, immediate.

## Deterministic reviewer path (no live peer required)
> Fixture status: a scripted reviewer conversation is provided via a seeded fixture account (see reviewer credentials submitted in App Store Connect, NOT in this repo). The fixture uses the same authorization/moderation/crisis code paths as production and is isolated from real users. A bot/script is never presented as a real peer — the scripted partner is clearly labelled.
> If credentials are not yet attached to this build, contact the moderation/support address in App Store Connect and one will be provisioned.

## Voice notes (safety model)
- Recording requires: (1) accepting an in-app voice-privacy notice, then (2) granting microphone permission. Declining either leaves text chat fully usable.
- Every voice note is size/duration-validated, transcribed by OpenAI (US) for a safety check, moderated, and only then delivered. Fail-closed: if the safety check can't run, the note is not delivered (retryable).
- Reported voice notes can be played only by an authenticated moderator, decrypted on demand, with the access audited. There is no public audio URL.

## Data & privacy
- Encryption in transit and at rest (not end-to-end — the server can read messages for the safety features above). Disclosed in the in-app Privacy Notice.
- Processors: OpenAI (matching/analysis, voice transcription, optional translation), Sentry (diagnostics), Expo/APNs (push), Railway (hosting).
- Push notifications are neutral ("You have a new message") — no message content.

## Known reviewer-facing notes
- iPad: `supportsTablet` is currently true — confirm rendering or set false before submission.
- Guideline 1.2: the app materially implements operator-known identity, structured matching, pre-delivery filtering (text and voice), durable block/report, human moderation, and no public discovery.

## Support / moderation contact
See the support and moderation contact in App Store Connect. A moderator is reachable during review.
