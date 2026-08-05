# Empath

Peer-to-peer emotional support platform: users are matched by AI analysis of a free-text prompt and talk via async text chat with optional timed live sessions. Target: free, UK-first, adults-only (18+) iOS v1, pseudonymous public presence.

> Facts below verified against source at commit `7c67525` (2026-08-05) on branch `app-store-readiness`. For current App Store readiness state, blockers, and baseline command evidence see `APP_STORE_READINESS_STATUS.md`. Do not trust this file over failing tests or current source.

## Tech stack

**Backend** (`/src`): Node 20, TypeScript strict, Express 5, Socket.IO 4, Prisma 6 (PostgreSQL + pgvector), ioredis, Vitest.
**Client** (`/client`): Expo SDK 54, expo-router v6, Zustand, TanStack Query, Socket.IO client, expo-av (voice — slated for removal in v1), Sentry.
**Infra**: Docker Compose (Postgres 16 + Redis 7); Railway deploy from `main` (`npm start` = `prisma migrate deploy && node dist`).

## Commands

```bash
# Backend (root)
npm test                    # Vitest (18 files; 153 passing at 7c67525)
npm run build               # prisma generate && tsc
npx tsc --noEmit
docker compose up -d        # local Postgres+Redis (user empath / empath_dev / db empath)

# Migrations — IMPORTANT
npx prisma migrate dev --create-only   # then REVIEW SQL before applying
npx prisma migrate deploy              # non-interactive apply (what prod runs)
# match_queue_entries is EXTERNALLY MANAGED (prisma.config.ts) because its hnsw
# index can't be modelled. Schema changes to it need hand-written SQL. A guard
# test (src/lib/migration-guard.test.ts) fails any migration that drops
# match_queue_embedding_idx. prisma.config.ts also disables CLI .env loading.

# Client
cd client && npx expo start
cd client && npx tsc --noEmit          # FAILS with 8 errors at 7c67525 (Wave 1 fix)
cd client && npx expo export --platform ios
```

## Backend modules (`src/`)

| Module | Purpose |
|---|---|
| `auth/` | Anonymous device JWT auth (15m access / 7d refresh), email upgrade, alias; `authMiddleware` (also enforces ban/suspension), `optionalAuthMiddleware`, `requireTier`, `requireCompliance` (age + sensitive-data consent) |
| `analyse/` | POST /match/analyse → PII-strip → OpenAI chat categorization + `text-embedding-3-large` embedding; stub mode without API key; raw prompt AES-encrypted in Redis `analyse:pending:{userId}` 10min TTL |
| `matching/` | Postgres `match_queue_entries` (pgvector) + Redis zset queue; cosine top-20 → hybrid score (`sim*0.9 + waitBonus*0.1 − recentPenalty`, min 0.25); 7-day queue, 24h proposals w/ expiry re-queue, 48h wait ramp, 24h recent-match penalty; daily caps in Redis |
| `chat/` | Socket.IO gateway (handshake = JWT + DB ban/suspension check), live sessions, in-memory message buffer, crisis-detection hook, per-user rate limit |
| `conversation/` | Async threads (AES-256-GCM at rest), read receipts, archive/reconnect, nicknames, voice notes, auto-archive (hourly, 7d stale) + retention worker (6h) |
| `safety/` | Crisis keyword/regex detection + resources; `crisis.service` (records CrisisEvent **and sets one-way retentionHold**); reports (re-encrypted conversation snapshot, priority, auto-block); user+device blocking; `enforcement.service` = the ONLY path for ban/suspend/lift (cross-instance socket disconnect via Redis `moderation:disconnect`) |
| `admin/` | Moderation dashboard (public HTML shell; data endpoints behind shared `ADMIN_SECRET` Bearer) — queue, decrypted transcripts, dismiss/warn/suspend/ban/escalate, escalation resolve, stats |
| `compliance/` | Age/terms/consent recording (versioned canonical texts), DSAR export, complaints, account deletion, retention deletes |
| `translate/` | Opt-in message translation via OpenAI; AES-encrypted Redis cache `translate:v2:` 24h TTL; local script heuristic for source-language tagging; NO LLM locale inference (removed for GDPR necessity) |
| `notifications/` | EventEmitter bus (+ Redis publish with **no subscriber** — cross-instance leg unfinished) + Expo push sender |
| `presence/`, `settings/`, `categories/`, `config/`, `lib/`, `shared/` | Presence (Redis TTL), translation prefs, 8-category catalog, env/tiers/legal-text config, prisma/redis/crypto clients, errors/rate-limit/types |
| `journaling/` | 501 stub only |

### AI processor guard
`config/index.ts` fails boot unless AI traffic goes to `https://api.openai.com/v1` (approved-processor allowlist; namespaced `OPENROUTER_MODEL` or custom `OPENAI_BASE_URL` → exit). Startup logs `[ai] endpoint … | mode: live/STUB`. With no API key, all AI flows (analyse chat, embeddings, translation) fall back to local stubs; production refuses to boot without a key. LLM locale inference was removed entirely.

## REST endpoints (auth as actually applied)

- `/auth`: POST `/anonymous`, POST `/refresh` (no auth); POST `/upgrade`, PUT `/alias` (auth).
- `/match/analyse`: POST — **auth only, NO requireCompliance** (mounted before `/match`; known blocker).
- `/match` (auth + requireCompliance router-level): GET `/status`, POST `/join`, GET `/queue-status`, DELETE `/leave`; PUT `/preferences` (PREMIUM, **501**), POST `/schedule` (PLUS, **501**).
- `/categories`: GET (optional auth).
- `/conversations` (auth + requireCompliance + rate limit): GET `/`, `/archived`, `/:id/messages`; POST `/:id/messages`; PUT `/:id/messages/read`, `/:id/archive`, `/:id/nickname`; DELETE `/:id`; POST `/:id/reconnect`; GET `/:id/summary` (PREMIUM, **501**).
- `/journal` (auth + PREMIUM): GET/POST — **501**.
- `/notifications`: POST `/push-token` (auth).
- `/safety` (auth): POST `/report`, POST `/block`, GET `/blocked`, DELETE `/block/:blockedUserId` (**known bug: deletes both directions**).
- `/compliance` (auth): age-confirm, terms/accept, consent, consent/withdraw, complaints (GET/POST), export (DSAR), DELETE account.
- `/admin`: GET `/` public shell; rest behind `adminAuth` shared secret.
- `/settings` (auth): GET/PUT `/translation`.
- `/health`: GET (none).

## Socket.IO events

Handshake: `auth.token` JWT verified + DB `banned`/`suspendedUntil` check (fail-closed). **No age/terms/consent check at connect (known blocker).**

Client→server: `conversation:join` (participant-checked), `conversation:message`, `conversation:voice-note`, `message:delivered`, `message:read`, `typing`, `livesession:invite|accept|decline|join|message|extend|end`, `match:accept`, `match:decline`, `push:active`, `push:inactive`. Several handlers rely on downstream services for participant checks or lack them entirely — see the authorization matrix work (Phase 4) in `APP_STORE_READINESS_STATUS.md`.

Server→client: `conversation:joined|message`, `message:read`, `typing`, `crisis:detected`, `livesession:invite|declined|started|joined|ended|extended|extend-requested|message`, `match:proposed|confirmed|declined|online|offline`, `notification`, `error`.

## Tiers (`src/config/tiers.ts`)

| | FREE | PREMIUM | PLUS |
|---|---|---|---|
| dailyNewMatches | 10 | 10 | unlimited (0) |
| live session | 20m | 45m | 60m |
| extend (+10m) | ✗ | ✓ | ✓ |
| sub-tags / priority (−60s) / reconnect / journaling* / summary* / preferences* | ✗ | ✓ | ✓ |
| voice notes | ✗ | ✗ | ✓ |
| scheduling* | ✗ | ✗ | ✓ |

\* backing endpoints are 501 stubs. **v1 ships free**: no IAP exists; visible upsell was removed from home (7c67525) but a full tier/lock surface sweep is pending (Phase 10). `UpgradePrompt.tsx` still exists unused.

## Categories

8 categories (`categories/categories.data.ts`): work-career, relationships, financial-stress, grief, academic-pressure, health, parenting, identity — each with 4–5 sub-tags, subset `premiumOnly`. Matching ignores category selection: all joins route through the AI-prompt flow; display category comes from analysis `primaryCategory`.

## Workers (started in `src/index.ts`)

message buffer (live-session flush), matching worker (Redis pub/sub `queue:updated`/`match:declined` + 5s fallback poll; proposal expiry + stale cleanup every 5min), outcome worker (hourly MatchQualityLog backfill), auto-archive (hourly, 7d), retention worker (6h: expired messages/crisis events/reports/terms/consents/complaints), push listener, enforcement subscriber (`moderation:disconnect`), one-shot legacy translation-cache purge, legal-text seeding.

## Database (see `prisma/schema.prisma` — authoritative)

Highlights: `User` (deviceId identity, tier, banned/suspendedUntil, preferredLanguage/dialect, `autoTranslateEnabled` **default false — opt-in with recorded consent, never default true**), `Conversation` (**`retentionHold` one-way flag — set by crisis events + escalations, nothing may clear it**), `Report` (priority, conversationLog snapshot, escalation outcome fields), `Message` (AES fields, messageType text/voice, unused `flagged` column), `MatchQueueEntry` (**external table**, pgvector), `ModerationAction`, `CrisisEvent`, `BlockedUser` (user+device level), consent/terms/complaint records.

## Key invariants (do not regress)

1. **Enforcement single path**: bans/suspensions/lifts only via `safety/enforcement.service.ts` (DB write + cross-instance disconnect). Admin module never touches `prisma.user` or io directly.
2. **Retention hold is one-way**: no code path clears `retentionHold`. Resolving an escalation must not unfreeze evidence. Retention worker skips held conversations and pending/reviewing/escalated reports.
3. **AI processor allowlist**: OpenAI only, fail-closed at boot; analyse strips PII first; translation requires opt-in recorded consent; no message content to LLMs outside the disclosed flows.
4. **hnsw index**: never let a migration drop `match_queue_embedding_idx` (guard test + external-table config).
5. **Escalate**: sets retention hold + 7-day interim suspension + founder push (`FOUNDER_PUSH_TOKENS`); resolution records outcome, may lift suspension, never clears hold.

## Known blockers at 7c67525 (remediation in progress on `app-store-readiness` — see status doc)

P0: `/match/analyse` lacks requireCompliance; socket connect lacks age/terms/consent; incomplete participant authorization on several socket/REST/live-session events; `match:decline` reportedly mutable by non-participant (verify); bidirectional unblock bug; push payloads may carry plaintext message content; no pre-delivery content moderation; identity is disposable/anonymous (Apple Guideline 1.2 risk).
P1: crisis detection ordering vs authorization; over-broad report snapshots; shared moderator secret (no individual identity/MFA/audit trail); translation consent logging is client-side best-effort; client TS errors (8) / Expo patch drift (7) / dependency vulns (2 client criticals).
Planned product changes: Sign in with Apple (pseudonymous public presence), voice notes disabled for v1 (expo-av + mic permission to be removed), free-only v1.

## Client structure (brief)

`client/app`: `(auth)` splash/onboarding/age-gate/choose-name/terms/consent/privacy-notice; `(app)/(tabs)` index (prompt+match), inbox, profile; `(app)` chat/[conversationId], archived, blocked, confirm, post-session, translation-settings.
`client/src`: `api/` REST clients (base URL from `EXPO_PUBLIC_API_URL`, set in `eas.json`), `stores/` zustand (auth persists via SecureStore, decodes userId/tier from JWT), `hooks/` queries+mutations+socket, `providers/` Socket/Query, `components/`, `theme/`, `types/`.
Registration flow: onboarding → splash auto-auth → age gate → terms → consent → app; compliance state mirrored in AsyncStorage but enforced server-side only where noted above.

## Error conventions

`AppError` base; `AuthError` 401, `ValidationError` 400, `ForbiddenError` 403, `NotFoundError` 404, `UpgradeRequiredError` 403 `{error:"upgrade_required", requiredTier}`.
