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

## Deterministic reviewer path (no live peer required) — IMPLEMENTED
The reviewer does not need to wait for a real match. A scripted **demo conversation** is provisioned automatically for the allowlisted reviewer account and appears in the normal Inbox.

**How it works (server-gated, secure):**
- Disabled by default. Active only when the server runs with `REVIEW_MODE=true`.
- Restricted to allowlisted reviewer Apple IDs via `REVIEW_APPLE_SUBS` (comma-separated Apple `sub` values) — the server checks the *persisted* Apple sub, never a client flag.
- On launch, a review build (`EXPO_PUBLIC_REVIEW_MODE=true`) calls `POST /review/demo-conversation`. Non-reviewers get 404; the reviewer gets an isolated conversation with a demo peer aliased **"Demo Peer (scripted, not a real person)"**. Idempotent.
- The demo peer never enters the real matching queue and is isolated from real users. Text/voice send, exact-message report, moderator playback, block, crisis, archive and account deletion all run through the **production** code paths.

**Reviewer steps (~5 min):**
1. Sign in with Apple; complete age (18+), Terms, and consent.
2. Open the **Demo Peer** conversation in the Inbox (auto-created).
3. Send a text message; send a voice note (observe it is transcribed + safety-checked before delivery).
4. Long-press a message → **Report**; long-press the demo peer's voice note → Report (moderators can then play only that exact note).
5. **Block** the demo peer; open **Profile** → structured match preferences visible on a new match; **Delete Account**.

**Owner prerequisite (not committed):** set `REVIEW_MODE=true` and `REVIEW_APPLE_SUBS=<reviewer Apple sub>` on the review backend, build the client with `EXPO_PUBLIC_REVIEW_MODE=true`, and submit the reviewer Apple ID credentials in App Store Connect. See APP_STORE_EXTERNAL_BLOCKERS.md.

## Voice notes (safety model)
- Recording requires: (1) accepting an in-app voice-privacy notice, then (2) granting microphone permission. Declining either leaves text chat fully usable.
- Every voice note is size/duration-validated, transcribed by OpenAI (US) for a safety check, moderated, and only then delivered. Fail-closed: if the safety check can't run, the note is not delivered (retryable).
- Reported voice notes can be played only by an authenticated moderator, decrypted on demand, with the access audited. There is no public audio URL.

## Data & privacy
- Encryption in transit and at rest (not end-to-end — the server can read messages for the safety features above). Disclosed in the in-app Privacy Notice.
- Push notifications are neutral ("You have a new message") — no message content.

### Data-flow / processors (for App Store privacy labels)
| Processor | Data | Purpose |
|---|---|---|
| Apple (Sign in with Apple) | Apple user identifier (`sub`), optional relay email | Account creation/security; not shown to peers |
| OpenAI (US) | PII-stripped matching text; **voice-note audio → transcript** (discarded after safety check, not stored by Empath); message content **only if** auto-translate is on | Matching analysis, pre-delivery voice moderation, optional translation |
| Sentry (EU ingest) | Crash/diagnostic data (no message content) | Diagnostics |
| Expo / APNs | Device push token | Neutral push delivery |
| Railway | Encrypted app data at rest | Hosting |

Empath does not retain voice transcripts. **Provider-side retention / zero-data-retention for OpenAI (including transcription inputs) is not yet confirmed in writing** — tracked as an external blocker; do not represent it as complete.

## Known reviewer-facing notes
- iPhone-only: `supportsTablet` is `false`; the app targets iPhone for v1.
- Guideline 1.2: the app materially implements operator-known identity, structured matching, pre-delivery filtering (text and voice), durable block/report, human moderation, and no public discovery.

## Support / moderation contact
See the support and moderation contact in App Store Connect. A moderator is reachable during review.
