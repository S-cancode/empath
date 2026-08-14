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
The reviewer signs in with their **own** Apple ID and unlocks a scripted **demo conversation** by entering an access code (supplied below in App Review notes). No live peer, and no need for us to know the reviewer's Apple account in advance.

**Reviewer steps (~5 min):**
1. **Sign in with Apple** (your own Apple ID); complete age (18+), Terms, and consent.
2. Go to **Profile → App Review Access**, enter the **access code** from App Review notes, and tap Redeem.
3. A scripted conversation with **"Demo Peer (scripted, not a real person)"** appears in the **Inbox**. Open it.
4. Play the demo peer's **voice note**; send your own text and a voice note (each is safety-checked before delivery).
5. Long-press a message → **Report**; long-press the demo peer's voice note → **Report** (a moderator can then play back only that exact note).
6. **Block** the demo peer, then relaunch — the demo conversation stays blocked (the block is not undone). **Delete Account** from Profile.

**How it works (server-gated, secure, non-circular):**
- Disabled by default. Active only when the backend runs with `REVIEW_MODE=true`.
- The reviewer redeems the code (`POST /review/redeem`): the code is verified **server-side** in constant time against `REVIEW_ACCESS_CODE`, rate-limited, and never stored in the app binary. Success creates a **durable review grant** tied to the reviewer's account, so the code is entered once.
- With a grant, `POST /review/demo-conversation` returns an isolated conversation with the demo peer; everyone else gets 404. Provisioning is idempotent, transactional and concurrency-safe (unique `review_key`), and preserves block/report state across relaunch.
- The demo peer never enters the real matching queue. Text/voice send, exact-message report, moderator playback, block, crisis, archive and account deletion all run through the **production** code paths.

Note: the scripted demo messages and the seeded incoming voice note are operator-authored content inserted directly into the database — they do **not** pass through OpenAI transcription/moderation (there is no user-generated content to check). Everything **you** send as the reviewer does.

**Owner prerequisite (not committed):** set `REVIEW_MODE=true` and a strong `REVIEW_ACCESS_CODE` (≥16 chars) on the review backend; build + submit the client with the **`store-review`** EAS profile:

```
eas build  --platform ios --profile store-review   # store-distribution, EXPO_PUBLIC_REVIEW_MODE=true, channel "store-review"
eas submit --platform ios --profile store-review   # same ASC app/team as production
```

The `store-review` build uses a **dedicated EAS update channel (`store-review`)**, isolated from `production` OTA updates — so a normal production update can never replace the review JavaScript and hide the App Review Access UI. Do NOT run `eas update --channel store-review` unless you intend to update the review build. Put the reviewer Apple ID + the access code in App Store Connect review notes. See APP_STORE_EXTERNAL_BLOCKERS.md.

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
| OpenAI (US) | PII-stripped matching text; **every outgoing text message** (moderation); **voice-note audio → transcript** (moderation, transcript discarded, not stored); message content **additionally** when auto-translate is on | Matching analysis, pre-delivery text + voice moderation, optional translation |
| Sentry (EU ingest) | Crash/diagnostic data (no message content) | Diagnostics |
| Expo / APNs | Device push token | Neutral push delivery |
| Railway | Encrypted app data at rest | Hosting |

Empath does not retain voice transcripts. **Provider-side retention / zero-data-retention for OpenAI (including moderation and transcription inputs) is not yet confirmed in writing** — tracked as an external blocker; do not represent it as complete.

## Known reviewer-facing notes
- iPhone-only: `supportsTablet` is `false`; the app targets iPhone for v1.
- The app the reviewer should be given is built with the **`store-review`** EAS profile (store distribution, review mode on). The internal `preview`/`review` profiles are for internal QA only and cannot be submitted.
- **Account deletion + Apple:** deletion erases the account immediately and attempts to revoke Sign in with Apple access server-side. If revocation can't be completed (e.g. a legacy account or a transient Apple error), the app says so and gives manual steps (Settings → Apple ID → Sign in with Apple → Empath → Stop Using) — it never falsely claims Apple access was revoked.
- Guideline 1.2: the app materially implements operator-known identity, structured matching, pre-delivery filtering (text and voice), durable block/report, human moderation, and no public discovery.

## Support / moderation contact
See the support and moderation contact in App Store Connect. A moderator is reachable during review.
