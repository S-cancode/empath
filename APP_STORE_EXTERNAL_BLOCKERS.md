# App Store External Blockers

Items that cannot be completed in code. Each needs an owner, evidence, and an explicit completion condition. **None of these are "done" until the evidence exists.**

## Legal entity / account
1. **Apple Developer membership + seller identity** must match the service's legal entity (D-U-N-S, contracts, bundle ID `com.shivandongha.empath`, support domain, privacy controller). Owner: Shivan. Done when: ASC account shows the correct legal entity and the app's privacy controller matches.
2. **Working privacy policy + support URLs** reachable publicly. Owner: Rohan. Done when: both URLs resolve and are entered in ASC.

## App Store Connect metadata
3. **App Privacy labels** mapped to actual processors: OpenAI (matching prompt analysis; **every outgoing text message** for pre-delivery moderation; voice-note audio→transcript for moderation; message content additionally when auto-translate is on), Sentry (crash/diagnostics), Expo push/APNs (device token), Railway (hosting). Owner: Shivan+Rohan. Done when: labels in ASC match the code's data flows (see PRIVACY docs). NOTE: no message content in push payloads (verified in code); translation is opt-in; **moderation is NOT opt-in — all chat text is classified before delivery**.
4. **Age rating questionnaire + 18+ rule.** App has an 18+ age gate and mental-health content. Owner: Shivan. Done when: ASC rating is 17+ and the 18+ gate is described in review notes.
5. **Screenshots** for iPhone device classes (iPad support is off — `supportsTablet: false`, iPhone-only v1). Owner: Shivan. Done when: iPhone screenshots uploaded to ASC.
6. **Encryption / export-compliance answers.** `ITSAppUsesNonExemptEncryption=false` is set. Owner: Shivan. Confirm this is accurate (only HTTPS/standard crypto) in ASC.
7. **Content rights** declaration. Owner: Shivan.

## Operational
8. **UK storefront config + runtime country-aware crisis behaviour.** Code supports per-user `crisisCountry` with international fallback. Owner: Shivan. Done when: UK is primary storefront and crisis routing verified on-device.
9. **Named moderation contact + live backend throughout review.** Owner: Rohan. Done when: a moderator is reachable and the Railway backend stays up during review.
10. **Moderator operations (partial in code):** individual moderator accounts + TOTP + immutable audit log are IMPLEMENTED (Wave 4b). STILL EXTERNAL: (a) secret/credential rotation policy, (b) periodic access review, (c) alerting on suspicious moderator activity, (d) on-call staffing to meet the published response-time target. Owner: Rohan. Done when: a written ops runbook exists and on-call coverage is scheduled.

## Legal / compliance (Rohan)
11. **DPIA + special-category-data assessment** updated to current data flows (Apple sign-in, OpenAI translation opt-in, moderation, crisis records, retention). Done when: signed DPIA on file.
12. **UK Online Safety Act:** illegal-content risk assessment, applicable Codes-of-Practice controls, complaints/reporting records, priority-offence handling, accountable owner, children's-access assessment (app is 18+). Done when: risk assessment + records on file with an accountable owner named.
13. **OpenAI DPA / ZDR** (from earlier work): confirm signed API DPA with SCCs, request zero-data-retention. This must cover ALL OpenAI endpoints the app uses: matching analysis, **the moderation endpoint (every outgoing text message passes through it)**, transcription (voice), and translation (opt-in). Owner: Rohan.
13a. **Voice transcription provider (OpenAI Whisper) DPA + retention confirmation.** Voice notes are sent to OpenAI's transcription API for pre-delivery safety checks. Confirm the same signed API DPA/SCCs cover the audio/transcription endpoints, and confirm OpenAI's retention posture for transcription inputs (request ZDR). App-side, transcripts are discarded immediately and never stored; audio itself is encrypted at rest. Owner: Rohan. Done when: DPA scope + transcription retention confirmed in writing.
14. **Research/ethics classification** if applicable (peer mental-health support). Owner: Rohan.

## App Review access
15. **Reviewer credentials + exact notes** — the deterministic reviewer path is IMPLEMENTED and **non-circular**: the reviewer signs in with their own Apple ID and redeems a server-verified access code (`POST /review/redeem`) to unlock the scripted demo (`POST /review/demo-conversation`). Owner action to activate: (a) set `REVIEW_MODE=true` and a strong `REVIEW_ACCESS_CODE` (≥16 chars, server-only) on the review backend; (b) build the client with the **`store-review`** EAS profile (store distribution; sets `EXPO_PUBLIC_REVIEW_MODE=true`); (c) enter the reviewer Apple ID + the access code + notes in App Store Connect (see `APP_REVIEW_NOTES.md`). The optional `REVIEW_APPLE_SUBS` allowlist is a fallback and no longer required. Done when: `REVIEW_ACCESS_CODE` set, store-review build submitted, credentials + code in ASC.

## Sign in with Apple deletion (server credentials)
16. **Apple server-to-server credentials** for authorization-code exchange + token revocation on account deletion (Apple TN3194). Set `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (.p8 PKCS#8), and optionally `APPLE_CLIENT_ID` (defaults to the bundle id) on the backend. Without them, sign-in still works but deletion cannot revoke Apple access programmatically and the app shows manual-revocation guidance instead. Owner: Shivan. Done when: credentials set on the production backend and a test deletion revokes Apple access.

---
Residual code note: `ADMIN_SECRET` env var is now vestigial (moderator auth replaced it); safe to remove from Railway after confirming no other consumer.
