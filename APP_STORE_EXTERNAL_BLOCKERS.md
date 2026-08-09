# App Store External Blockers

Items that cannot be completed in code. Each needs an owner, evidence, and an explicit completion condition. **None of these are "done" until the evidence exists.**

## Legal entity / account
1. **Apple Developer membership + seller identity** must match the service's legal entity (D-U-N-S, contracts, bundle ID `com.shivandongha.empath`, support domain, privacy controller). Owner: Shivan. Done when: ASC account shows the correct legal entity and the app's privacy controller matches.
2. **Working privacy policy + support URLs** reachable publicly. Owner: Rohan. Done when: both URLs resolve and are entered in ASC.

## App Store Connect metadata
3. **App Privacy labels** mapped to actual processors: OpenAI (message content only when auto-translate on; matching prompt analysis), Sentry (crash/diagnostics), Expo push/APNs (device token), Railway (hosting). Owner: Shivan+Rohan. Done when: labels in ASC match the code's data flows (see PRIVACY docs). NOTE: no message content in push payloads (verified in code); translation is opt-in.
4. **Age rating questionnaire + 18+ rule.** App has an 18+ age gate and mental-health content. Owner: Shivan. Done when: ASC rating is 17+ and the 18+ gate is described in review notes.
5. **Screenshots** for every supported device class (or drop iPad — `supportsTablet` currently true). Owner: Shivan. Done when: screenshots uploaded or iPad support removed.
6. **Encryption / export-compliance answers.** `ITSAppUsesNonExemptEncryption=false` is set. Owner: Shivan. Confirm this is accurate (only HTTPS/standard crypto) in ASC.
7. **Content rights** declaration. Owner: Shivan.

## Operational
8. **UK storefront config + runtime country-aware crisis behaviour.** Code supports per-user `crisisCountry` with international fallback. Owner: Shivan. Done when: UK is primary storefront and crisis routing verified on-device.
9. **Named moderation contact + live backend throughout review.** Owner: Rohan. Done when: a moderator is reachable and the Railway backend stays up during review.
10. **Moderator operations (partial in code):** individual moderator accounts + TOTP + immutable audit log are IMPLEMENTED (Wave 4b). STILL EXTERNAL: (a) secret/credential rotation policy, (b) periodic access review, (c) alerting on suspicious moderator activity, (d) on-call staffing to meet the published response-time target. Owner: Rohan. Done when: a written ops runbook exists and on-call coverage is scheduled.

## Legal / compliance (Rohan)
11. **DPIA + special-category-data assessment** updated to current data flows (Apple sign-in, OpenAI translation opt-in, moderation, crisis records, retention). Done when: signed DPIA on file.
12. **UK Online Safety Act:** illegal-content risk assessment, applicable Codes-of-Practice controls, complaints/reporting records, priority-offence handling, accountable owner, children's-access assessment (app is 18+). Done when: risk assessment + records on file with an accountable owner named.
13. **OpenAI DPA / ZDR** (from earlier work): confirm signed API DPA with SCCs, request zero-data-retention. Owner: Rohan.
13a. **Voice transcription provider (OpenAI Whisper) DPA + retention confirmation.** Voice notes are sent to OpenAI's transcription API for pre-delivery safety checks. Confirm the same signed API DPA/SCCs cover the audio/transcription endpoints, and confirm OpenAI's retention posture for transcription inputs (request ZDR). App-side, transcripts are discarded immediately and never stored; audio itself is encrypted at rest. Owner: Rohan. Done when: DPA scope + transcription retention confirmed in writing.
14. **Research/ethics classification** if applicable (peer mental-health support). Owner: Rohan.

## App Review access
15. **Reviewer credentials + exact notes** — the deterministic reviewer path is IMPLEMENTED (server-gated `POST /review/demo-conversation`, off by default). Owner action to activate: (a) set `REVIEW_MODE=true` and `REVIEW_APPLE_SUBS=<reviewer Apple sub>` on the review backend; (b) build the client with `EXPO_PUBLIC_REVIEW_MODE=true`; (c) enter the reviewer Apple ID + notes in App Store Connect (see `APP_REVIEW_NOTES.md`). The reviewer's Apple `sub` is obtained on their first sign-in to the review backend. Done when: allowlist configured and credentials in ASC.

---
Residual code note: `ADMIN_SECRET` env var is now vestigial (moderator auth replaced it); safe to remove from Railway after confirming no other consumer.
