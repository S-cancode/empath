# App Store Readiness — Status

Working branch: `app-store-readiness` (created from origin/main `7c67525b5b2b83274f2cb09d81b32f4262f79286`, verified 2026-08-05 via `git fetch origin --prune && git rev-parse origin/main`).
Remote delta vs last audited SHA: **none** (origin/main == 7c67525).
Stale `ui-overhaul` branch: present locally and on origin; untouched per working rules.
Detailed remediation checklist file referenced in the master prompt (`.hermes/plans/...`) is **not present on this machine**; working from the master prompt directly.

## Baseline (verified 2026-08-05, branch app-store-readiness @ 7c67525)

### Root (backend)
| Check | Command | Result |
|---|---|---|
| Install | `npm ci` | pass |
| Tests | `npm test` | **153 passed (153)**, 18 files |
| Build | `npm run build` (prisma generate && tsc) | pass |
| Prod audit | `npm audit --omit=dev` | **14 vulnerabilities (1 low, 4 moderate, 9 high, 0 critical)** — headline: `ws` (uninitialized memory disclosure GHSA-58qx-3vcg-4xpx; DoS GHSA-96hv-2xvq-fx4p) via `socket.io-adapter` 2.5.2–2.5.6 |

Note: master prompt recorded 19 root vulns incl. 1 critical at the same SHA; current clean-checkout audit shows 14 with 0 critical (advisory DB / lockfile state drift). Current numbers are authoritative.

### Client (Expo)
| Check | Command | Result |
|---|---|---|
| Install | `npm ci` | pass |
| TypeScript | `npx tsc --noEmit` | **FAIL — 8 errors**: `profile.tsx:101` implicit any; `chat/[conversationId].tsx:92,96` `"push:active"`/`"push:inactive"` not in socket emit event union; `:180` implicit any; `:326-328` optimistic message type lacks `messageType`/`voiceDurationMs`/`waveform`; `useRegisterPushToken.ts:11` NotificationBehavior missing `shouldShowBanner`/`shouldShowList` |
| Expo doctor | `npx expo-doctor` | **FAIL — 7 SDK 54 patch mismatches**: expo ~54.0.36 (54.0.33), expo-crypto ~15.0.9 (15.0.8), expo-file-system ~19.0.23 (19.0.21), expo-linking ~8.0.12 (8.0.11), expo-notifications ~0.32.17 (0.32.16), expo-router ~6.0.24 (6.0.23), expo-updates ~29.0.19 (29.0.16) |
| Prod audit | `npm audit --omit=dev` | **31 vulnerabilities (1 low, 17 moderate, 11 high, 2 critical)** |
| iOS export | `npx expo export --platform ios` | pass (11MB bundle + assets) |

## Completed
- [x] Remote verification, branch `app-store-readiness` created from verified SHA
- [x] Baseline commands run and recorded (above)
- [x] APP_STORE_READINESS_STATUS.md created
- [x] CLAUDE.md rewritten from a full code survey at 7c67525 (modules, real endpoint/auth map, socket events with authz caveats, actual tier values, matching constants, workers, invariants, known blockers — stale claims removed)
- [x] CI added (.github/workflows/ci.yml): backend build+test and client tsc/expo-doctor/iOS-export mandatory; prod audits informational until Phase 1 sets the zero-critical gate. Client job will be RED until Wave 1 fixes the 8 TS errors + 7 patch mismatches — intentional.
- [x] Wave 0 milestone commit

## Next exact action
Wave 1 (Phase 1): fix the 8 client TS errors starting with typed push:active/push:inactive socket events (client/src/types/socket.ts + server contract), full Message type on optimistic sends, NotificationBehavior fields; then `npx expo install --check` for the 7 patch mismatches; then dependency audits.

## Wave 1 — Technical health (completed 2026-08-05)
- Client TypeScript: **8 → 0 errors.** `push:active`/`push:inactive` added to the typed ClientToServerEvents map (matching the existing server handlers — no casts); optimistic messages now constructed as full `Message` objects (`messageType: "text"`), removing the union casts in the chat render; `Alert.prompt` callbacks typed `(value?: string)`; NotificationBehavior gains `shouldShowBanner`/`shouldShowList` (both false — app suppresses foreground alerts by design).
- Expo doctor: **7 patch mismatches → 18/18 checks pass** via `npx expo install --fix` (expo 54.0.36, expo-crypto 15.0.9, expo-file-system 19.0.23, expo-linking 8.0.12, expo-notifications 0.32.17, expo-router 6.0.24, expo-updates 29.0.19).
- Dependency audits (prod): **root 14 (9 high) → 0**; **client 31 (2 critical, 11 high) → 15 (14 moderate, 1 high)** via `npm audit fix` (no --force, no majors).
- **Accepted finding (documented per rule 7/Phase 1.7):** client `postcss` HIGH (XSS via unescaped `</style>`, GHSA chain via Expo toolchain). Reachability: build-time CSS tooling pulled by Expo's bundler chain; not exercised against untrusted CSS at runtime on device — app renders RN components, not remote CSS. Fix requires Expo SDK 57 major upgrade (`fixAvailable: expo@57`, semver-major) — out of scope mid-hardening. Compensating controls: no remote stylesheet ingestion; CSP-irrelevant native runtime. Owner: Shivan. Expiry: revisit at next Expo SDK upgrade or 2026-11-01, whichever first.
- Regression after upgrades: backend tests + build pass, client tsc clean, iOS export pass.

## Wave 2 — Persistent identity & canonical compliance (in progress)
- **2a (d116431)**: Sign in with Apple server core. POST /auth/apple with JWKS verification (issuer/audience pinned), accounts keyed on Apple sub; device-account linking preserves enforcement history; banned refused at login; deleted never resurrected; anonymous auth forbidden in production; revokeUserSessions wired into ban/suspension. 13 TDD tests.
- **2b (fca789e)**: Client Apple sign-in flow (official button, pseudonymity explainer, dev-only anonymous fallback); splash converted to session gate; expo-apple-authentication plugin + usesAppleSignIn entitlement. Owner enabled the capability on App ID com.shivandongha.empath.
- **2c (this commit)**: Canonical compliance gate (`compliance-gate.service`) — deleted/banned/suspended/18+/DOB re-check/current canonical terms version/current canonical sensitive-data consent, versions from DB only (client input has no path in), fail-closed, 60s canonical cache + 30s per-user cache with invalidation. Applied: rewritten `requireCompliance` (REST), **/match/analyse now gated before any AI/Redis processing**, Socket.IO handshake, per-event guard on conversation:message / voice-note / livesession:message / match:accept (guard also disconnects). Revocation cascade on ban/suspension/consent-withdrawal/deletion: sessions revoked + matching eviction (queue + pending proposal with counterpart re-queue) + compliance cache invalidated + sockets disconnected; deletion also frees appleSub. Wiring regression tests pin requireCompliance on analyse + matching routers. 24 new tests (TDD, failures verified first); 190/190 passing.
- **2d (this commit)**: Object/event authorization. New `src/chat/authz.ts` (participant/active/live-session assertions). **P0 fixed: `declineProposal` now rejects non-participants** (was: any authenticated user could cancel strangers' matches). Crisis detection reordered AFTER participant authorization on conversation:message and livesession:message. Participant guards added to message:read, livesession:invite (fixed neither-A-nor-B partner-derivation bug), livesession:accept, livesession:message (+session↔conversation match), livesession:extend, livesession:end; conversation:join refactored to the helper. AUTHORIZATION_MATRIX.md documents every event. 10 new negative/positive tests; 200/200 passing.
- **Wave 2 COMPLETE.** Residual tracked for later waves: DELETE /safety/block bidirectional bug (Wave 3), admin shared secret (Wave 4).

## Wave 3 — Safety invariants (COMPLETE)
- **3a**: Pre-delivery content moderation (Apple 1.2). content-moderation.service (OpenAI omni-moderation + local heuristic, 4s timeout, fail-closed→quarantine); wired into sendAsyncMessage before persistence; blocked/quarantined never persist/notify/push; ModerationBlock table stores categories only (no content).
- **3b**: Directional block fix — unblockUser removes only the caller's own block; reactivation requires NEITHER direction blocking.
- **3c**: Neutral push — new_message shows "Empath / You have a new message" (was plaintext body, P0); plaintext removed from notification bus; match payloads routing-only; token not logged.
- **3d**: Crisis privacy — crisis:detected to affected sender only, no keywords to peer; getCrisisResources country-aware + international fallback; User.crisisCountry + /settings/crisis-country.
- **3e**: Voice disabled for v1 — sendVoiceNote + socket voice-note + REST voice-note all reject server-side; client voice UI removed (ChatInput text-only, useVoiceRecorder + VoiceMessageBubble deleted); expo-av dependency + mic permission + plugin removed from app.json. No microphone reference remains in release config; backend rejects voice payloads (test).
- 223/223 tests; client tsc clean; expo-doctor 18/18.

## Wave 4 — Ops, privacy, free v1, structured matching (COMPLETE, code-side)
- **4a**: Free single-tier v1. FREE tier gets all working features (no shown-but-locked); dead monetization UI removed (UpgradePrompt/SubTagSheet/LockIcon); TierCard neutralized.
- **4b**: Individual moderator accountability. Moderator accounts (email+password(bcrypt)+TOTP), short-lived session JWT with tokenVersion revocation, moderatorAuth middleware (server-derived actor), append-only ModeratorAuditLog, dashboard login, create-moderator script. APP_STORE_EXTERNAL_BLOCKERS.md created for rotation/access-review/on-call + legal items.
- **4c**: Server-verified translation consent (ConsentRecord gate on enabling auto-translate); privacy notice corrected (Sign in with Apple not "anonymous", pseudonymity to peers, limited/logged moderator-access disclosure; no E2E/"completely anonymous" claims).
- **4d**: Structured matching hard filter. Versioned MatchProfile (intent/interactionStyle/wantsAdvice), enum validation rejected server-side at join, areCompatible() hard filter runs in candidate selection BEFORE scoring (incompatible contexts never pair regardless of similarity), non-sensitive match rationale. 19 new tests incl. "never pairs incompatible contexts at high similarity".
- 252/252 tests; client + server tsc clean; expo-doctor 18/18.
- **Remaining for 4d (product decision + client work, flagged):** capturing intent/interactionStyle from the user needs onboarding/prompt UI; backend enforces compatibility whenever the profile is present, but the client does not yet collect it. Also documented: hard filter runs in the candidate-evaluation loop (top-20) rather than the SQL WHERE — acceptable given matchContext is JSONB, full SQL pre-filter is a possible later optimization.

## Voice notes — re-added WITH transcription-based moderation (branch fix/voice-note-app-review)
Owner chose to keep voice notes in v1 with a real safety pipeline (not disabled, not raw). Supersedes the earlier "voice disabled" note.
- **T2 validation**: server-side runtime validation (non-empty conversation, valid round-trippable base64, decoded-size cap, positive-integer duration ≤60s, waveform ≤600 samples finite in [0,1]) before any decode/transcribe/encrypt/persist.
- **T3 pre-delivery moderation**: auth → compliance → rate → validate → participant → decode → **OpenAI whisper-1 transcription → existing moderateText(transcript) → discard transcript** → persist/broadcast if allowed. Fail-closed: transcription/moderation failure → quarantine (retryable). Blocked/quarantined voice never persists/broadcasts/notifies. Transcript never stored/returned/logged.
- **T4 exact reporting**: `Report.reportedMessageId` relation; server verifies the reported message belongs to the conversation + reported sender; long-press report on voice bubbles.
- **T5 moderator playback**: `GET /admin/reports/:id/voice/:messageId` — moderator session, message must belong to the report, decrypt on demand, `Cache-Control: no-store`, audited (`play_reported_voice`, no audio content), no audio in list JSON, unreported voice not browsable. Dashboard audio player.
- **T6 consent/permission UX**: versioned voice-privacy notice before first mic request (names OpenAI/US, transcription, discard, moderator review); acceptance stored + recorded as ConsentRecord(voice_notes v1.0); decline keeps text usable; mic denial explained with Open Settings; accurate NSMicrophoneUsageDescription.
- **T7 reliable send + cleanup**: Socket.IO ack (processing/sent/rejected/retry) replaces the 800ms refetch; duplicate sends prevented; try/finally always resets iOS audio mode + deletes the source recording; playback temp files deleted on finish/stop/error/unmount.
- **CI**: fixed independently (client deps in backend job; TOTP ±1 window). Green.
- Tests: 277 backend passing (voice validation/moderation/reporting/playback covered); client tsc clean; expo-doctor 18/18; iOS export passes.

## Phase plan (agreed with owner)
Wave 0: baseline/truth/CI (this) → Wave 1: technical health (8 TS errors, Expo patches, dep vulns) → Wave 2: persistent identity (SIWA pending owner decision), canonical compliance, authorization matrix → Wave 3: pre-delivery moderation, directional blocks, crisis privacy, neutral push, voice removal → Wave 4: moderator accountability, privacy/retention truth, free-v1 sweep, structured matching → Wave 5: reviewer fixture, EAS artifact inspection, device QA/TestFlight/soak.

## Open decisions (owner: Shivan/Rohan)
1. Identity mechanism: Sign in with Apple (preferred by master prompt) vs email magic link. **Blocks Phase 2.**
2. Voice notes disabled for v1 (master prompt directs yes — reverses mic-permission work from 7c67525). **Blocks Phase 7; assumed YES unless countermanded.**
3. iPad: drop `supportsTablet` vs real iPad QA. **Blocks Phase 12 scope.**
4. Moderator MFA scope for a two-person team. **Blocks Phase 8 design.**

## Known code blockers carried from master prompt (to re-verify per phase)
P0: no requireCompliance on /match/analyse; socket auth lacks age/terms/consent; missing participant authorization on several REST/socket/live-session actions; `match:decline` mutable by non-participant; `DELETE /safety/block/:blockedUserId` deletes both directions (verified in source at 7c67525 — `src/safety/safety.router.ts:78-85`); push payloads carry plaintext message content; no pre-delivery content filter.
P1: crisis detection ordering before authz; report snapshots over-broad; shared moderator secret; translation consent not server-verified before enable; disposable anonymous identity.
P2: stale CLAUDE.md (being fixed), remaining tier/lock surface sweep, report retention minimization details.

## Risks / notes
- Apple Guideline 1.2 remains a residual review risk regardless of implementation quality. No approval is promised.
- No pushes to origin without explicit owner instruction; commits are local milestones on `app-store-readiness`.
- Prisma: `match_queue_entries` is externally managed (prisma.config.ts) — generated migrations must never drop `match_queue_embedding_idx` (guard test in `src/lib/migration-guard.test.ts`).

