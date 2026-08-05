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

