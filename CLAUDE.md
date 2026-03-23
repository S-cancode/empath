# Empath

Anonymous peer-to-peer emotional support platform. Users are matched by shared life challenges and communicate through async messaging and optional timed live sessions.

## Tech Stack

**Backend** (root `/src`): Node.js, TypeScript (strict), Express 5, Socket.IO 4, Prisma 6 (PostgreSQL), ioredis (Redis), Vitest
**Frontend** (`/client`): Expo SDK 54, Expo Router v6, Zustand, TanStack React Query, Socket.IO client, react-native-svg, expo-av (voice notes)
**Infrastructure**: Docker Compose (Postgres 16 + Redis 7)

## Commands

```bash
# Backend
npm test                    # Run all 71 tests (Vitest)
npx tsc --noEmit            # TypeScript type check
npx prisma generate         # Regenerate Prisma client
npx prisma migrate dev      # Run database migrations
docker compose up -d        # Start Postgres + Redis

# Frontend
cd client && npx expo start # Start Expo dev server
```

## Backend Architecture

All source in `src/`. Entry point: `src/index.ts`. Socket.IO configured with `maxHttpBufferSize: 3e6` (3MB) for voice note payloads.

### Modules

| Module | Path | Purpose |
|--------|------|---------|
| Auth | `src/auth/` | Anonymous JWT auth (device fingerprint), access tokens (15min), refresh tokens (7d), `requireTier` middleware, `assertTier` helper |
| AI Analyse | `src/analyse/` | AI-powered text analysis for matching. POST /match/analyse sends user's free-text to GPT-4o-mini, extracts primary/secondary category, sub-tags, intensity, keywords (8-12), empathetic summary. Stub mode when no API key. Raw text encrypted in Redis (10min TTL), deleted after match. |
| Matching | `src/matching/` | Redis sorted-set queue, background worker (500ms poll), daily match caps via Redis counters, premium priority score offset, recent-match prevention (24h), keyword/intensity scoring for AI-prompt matches |
| Categories | `src/categories/` | 8 support categories with premiumOnly sub-tags, optional auth for tier-aware availability |
| Conversations | `src/conversation/` | Persistent async message threads, AES-256-GCM encryption, delivery status tracking (sent/delivered/read), voice notes (base64 audio encrypted in `content` field), archive, reconnect (mutual consent), auto-archive worker (7 days inactive) |
| Chat | `src/chat/` | Socket.IO gateway for real-time events, in-memory message buffer (flush every 5s or 20 msgs), live sessions with dynamic tier-based duration, mutual-consent extension, voice note event handler with 2MB payload limit |
| Safety | `src/safety/` | Crisis keyword + regex detection, reporting (8 categories, auto-block on report), blocking, ratings |
| Compliance | `src/compliance/` | Age verification (DOB, 18+), Terms of Service acceptance logging, explicit consent for sensitive data (UK GDPR Art 9), consent withdrawal, account deletion (right to erasure) |
| Notifications | `src/notifications/` | EventEmitter + Redis pub/sub notification bus |
| Presence | `src/presence/` | Redis set + hash for online/offline tracking |
| Tier Config | `src/config/tiers.ts` | Single source of truth for all tier limits |
| Journaling | `src/journaling/` | Stub router (premium-gated, returns 501) |
| Shared | `src/shared/` | Error classes, enums/types, rate limiter |

### Categories

1. Work & Career
2. Relationships
3. Financial Stress
4. Grief & Loss
5. Academic Pressure
6. Health & Chronic Illness
7. Parenting
8. Identity & Life Transitions

Each has 4-5 sub-tags. First 2 are free; rest are `premiumOnly: true`.

## Freemium Tiers

All limits defined in `src/config/tiers.ts` via `getTierLimits(tier)`. Never hardcode tier values elsewhere.

| Feature | FREE | PREMIUM | PLUS |
|---------|------|---------|------|
| Daily matches | 3 | 10 | Unlimited |
| Live session duration | 20 min | 45 min | 60 min |
| Session extension | No | +10 min | +10 min |
| Sub-tag selection | No | Yes | Yes |
| Priority matching | No | Yes | Yes |
| Reconnect archived | No | Yes | Yes |
| Voice notes | Yes | Yes | Yes |
| Session scheduling | No | No | Yes |
| Journaling | No | Yes | Yes |
| Post-session summary | No | Yes | Yes |
| Match preferences | No | Yes | Yes |

## REST API

All protected routes require `Authorization: Bearer <accessToken>`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | No | Health check |
| POST | /auth/anonymous | No | Create/retrieve anonymous user `{deviceId}` → `{accessToken, refreshToken, user}` |
| POST | /auth/refresh | No | Rotate tokens `{refreshToken}` → `{accessToken, refreshToken}` |
| POST | /auth/upgrade | Yes | Attach email `{email}` |
| GET | /categories | Optional | List categories with tier-aware `available` flags |
| GET | /match/status | Yes | Daily match quota `{used, limit, remaining, resetsInSeconds}` |
| POST | /match/analyse | Yes | AI text analysis `{text}` → `{primaryCategory, secondaryCategory?, subTags[], intensity, keywords[], summary}` |
| POST | /match/join | Yes | Join queue `{category?, subTag?, keywords?, intensity?, matchContext?}` → `{status, matchStatus}`. Category defaults to `"ai-prompt"` when omitted. |
| DELETE | /match/leave | Yes | Leave queue `?category=X` |
| GET | /conversations | Yes | List active conversations |
| GET | /conversations/archived | Yes | List archived conversations |
| GET | /conversations/:id/messages | Yes | Paginated messages `?cursor&limit` (decrypted server-side) |
| POST | /conversations/:id/messages | Yes | Send async message `{content}` |
| PUT | /conversations/:id/messages/read | Yes | Mark read `{upToMessageId}` |
| PUT | /conversations/:id/archive | Yes | Archive conversation |
| POST | /conversations/:id/reconnect | PREMIUM+ | Request reconnect (mutual consent) |
| POST | /conversations/:id/voice-note | Yes | Voice notes (use Socket.IO event instead) |
| GET | /conversations/:id/summary | PREMIUM+ | Stub (501) |
| PUT | /match/preferences | PREMIUM+ | Stub (501) |
| POST | /match/schedule | PLUS | Stub (501) |
| GET | /journal | PREMIUM+ | Stub (501) |
| POST | /journal | PREMIUM+ | Stub (501) |
| POST | /compliance/age-confirm | Yes | Confirm age via DOB `{dateOfBirth}` → `{confirmed}` |
| POST | /compliance/terms/accept | Yes | Accept ToS `{termsVersion, appVersion?}` |
| POST | /compliance/consent | Yes | Record consent `{consentType, version, granted, textHash, appVersion?, deviceType?}` |
| POST | /compliance/consent/withdraw | Yes | Withdraw sensitive data consent |
| DELETE | /compliance/account | Yes | Delete account (right to erasure) |

## Socket.IO Events

Connect with `auth: { token: accessToken }`.

### Client → Server

| Event | Payload |
|-------|---------|
| conversation:join | `{conversationId}` |
| conversation:message | `{conversationId, content}` |
| conversation:voice-note | `{conversationId, audio (base64), durationMs, waveform? (number[])}` |
| message:delivered | `{messageIds[]}` |
| message:read | `{conversationId, upToMessageId}` |
| livesession:invite | `{conversationId}` |
| livesession:accept | `{conversationId}` |
| livesession:decline | `{conversationId}` |
| livesession:join | `{liveSessionId}` |
| livesession:message | `{liveSessionId, conversationId, content}` |
| livesession:extend | `{liveSessionId}` |
| livesession:end | `{liveSessionId}` |
| typing | `{conversationId?} or {liveSessionId?}` |

### Server → Client

| Event | Payload |
|-------|---------|
| conversation:joined | `{conversationId}` |
| conversation:message | `{messageId, senderId, conversationId, content, sentAt, messageType?, voiceDurationMs?, waveform?}` |
| message:read | `{conversationId, upToMessageId, readBy}` |
| livesession:invite | `{conversationId, inviterId}` |
| livesession:declined | `{conversationId}` |
| livesession:started | `{liveSessionId, conversationId, durationMs}` |
| livesession:ended | `{reason, liveSessionId}` |
| livesession:extended | `{liveSessionId}` |
| livesession:extend-requested | `{userId}` |
| match:online | `{conversationId, partnerId}` |
| match:offline | `{conversationId, partnerId}` |
| typing | `{userId}` |
| crisis:detected | `{resources[], keywords[]}` |

## Database Schema

Prisma models in `prisma/schema.prisma`:

- **User** — id, deviceIdHash, anonymousAlias, email?, tier, tokenVersion, dateOfBirth?, ageConfirmedAt?, sensitiveDataConsent, consentWithdrawnAt?, deletedAt?, createdAt
- **Conversation** — id, userAId, userBId, category, subTag?, matchContext (Json?), rawPromptCipher/Iv/AuthTag (encrypted, nulled after match), status (active/archived/blocked), lastMessageAt, createdAt
- **LiveSession** — id, conversationId, status (active/completed/terminated), startedAt, endedAt?, durationSeconds?, extended
- **Message** — id, conversationId, senderId, content (encrypted), iv, authTag, deliveryStatus (sent/delivered/read), deliveredAt?, readAt?, sentAt, liveSessionId?, **messageType** (text/voice, default "text"), **voiceDurationMs** (Int?), **waveform** (Json?, array of 0-1 normalized audio levels)
- **Rating** — id, liveSessionId, raterId, score, createdAt
- **Report** — id, reporterId, reportedId, conversationId?, reason, status, createdAt
- **CrisisEvent** — id, userId, conversationId?, liveSessionId?, detectedKeywords, createdAt
- **TermsAcceptance** — id, userId, termsVersion, acceptedAt, ipCipher/Iv/AuthTag (encrypted), appVersion?
- **ConsentRecord** — id, userId, consentType, consentVersion, granted, textHash, recordedAt, withdrawnAt?, ipCipher/Iv/AuthTag (encrypted), appVersion?, deviceType?

## Key Patterns

- **Config-driven tiers**: All limits from `getTierLimits()` in `src/config/tiers.ts`
- **Mutual consent**: Session extension and archived reconnect both require both parties to agree
- **AES-256-GCM encryption**: All message content (text and voice note base64) encrypted at rest (`src/lib/crypto.ts`). Server-side encryption, not E2EE — server can read messages.
- **Redis daily counters**: `matches:{userId}:{YYYY-MM-DD}` with midnight UTC TTL
- **Premium priority matching**: Sorted-set score offset (`-60000ms`) for faster queue matching
- **AI-powered matching**: Free-text → GPT-4o-mini analysis → category/keyword extraction → scoring-based pair selection. Raw text never shown to partner, only extracted summary. Encrypted in Redis with 10min TTL, deleted after match.
- **Similarity-based matching**: AI-prompt users join a single global `match:queue:ai-prompt` queue. Matching uses enhanced `pairScore()` — keyword overlap (+2 each, case-insensitive), intensity proximity (up to +5), primary category match (+10), secondary category overlap (+5). Top 20 candidates evaluated per cycle with minimum score threshold of 2.
- **Real-time messaging**: Frontend sends messages via Socket.IO (`conversation:message` event). Global message listener (`useGlobalMessageListener`) joins all conversation rooms on connect, updates unread counts and inbox in real-time.
- **Server-side decryption**: Messages decrypted before returning from `getMessages()` so clients receive plaintext.
- **JWT-based identity**: Client decodes userId and tier from JWT during auth store hydration for correct message alignment (mine vs theirs).
- **Voice notes**: Recorded with `expo-av` (LOW_QUALITY preset), audio metering sampled every 100ms for waveform visualization. Base64 audio sent via Socket.IO `conversation:voice-note` event (max 2MB, 60s). Stored encrypted in Message.content field with messageType="voice". Playback writes base64 to temp file via `expo-file-system` new File API. Waveform bars scale with duration (bubble width 45-85% of screen).
- **Message buffer**: Live session messages buffered in-memory, flushed every 5s or at 20 messages
- **Async-first messaging**: Messages sent via Socket.IO for real-time delivery; REST endpoint also available. Live session is an opt-in upgrade
- **Regulatory compliance**: UK GDPR + Online Safety Act + Consumer Protection. Registration flow: Age Gate (DOB, 18+) → Terms of Service (checkbox acceptance, logged with encrypted IP) → Explicit Consent for sensitive data (UK GDPR Art 9, separate from ToS). Matching requires active consent. Account deletion via right to erasure (Art 17) with cascading data removal. Retention: ToS records 2yr post-deletion, consent records 6yr, report records 12mo from resolution.
- **Report categories**: 8 categories (harassment, self_harm_encouragement, sexual_content, spam_scam, medical_advice, illegal_content, underage_user, other). Auto-block on report submission.

## Testing

71 tests across 9 files. All external deps mocked (Prisma, Redis, notifications).

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `src/auth/auth.test.ts` | 10 | Anonymous auth, token refresh, upgrade |
| `src/auth/tier-middleware.test.ts` | 9 | requireTier at each level, assertTier |
| `src/matching/matching.test.ts` | 8 | Queue, matching, daily limits, premium priority |
| `src/chat/chat.test.ts` | 7 | Message buffer, live sessions, extension |
| `src/conversation/conversation.test.ts` | 12 | Async messages, read receipts, reconnect, auto-archive |
| `src/categories/categories.test.ts` | 8 | Category structure, premiumOnly flags |
| `src/safety/crisis.test.ts` | 10 | Crisis keyword + regex detection |
| `src/notifications/notification.test.ts` | 3 | Notification emission |
| `src/presence/presence.test.ts` | 4 | Online/offline tracking |

## Frontend Architecture

Key client files in `client/`:

| Area | Path | Notes |
|------|------|-------|
| Auth store | `client/src/stores/auth.store.ts` | Zustand, persists tokens via SecureStore, decodes userId+tier from JWT on hydrate |
| Conversations store | `client/src/stores/conversations.store.ts` | Optimistic messages, unread counts, presence, typing state, **nicknames** (persisted via AsyncStorage) |
| Socket provider | `client/src/providers/SocketProvider.tsx` | Socket.IO context, uses useState+useRef for re-render on connect |
| Global listener | `client/src/hooks/socket/useGlobalMessageListener.ts` | Joins all conversation rooms, increments unread counts, refreshes inbox |
| Send message | `client/src/hooks/mutations/useSendMessage.ts` | Emits via Socket.IO (not REST) for real-time delivery |
| Voice recorder | `client/src/hooks/useVoiceRecorder.ts` | expo-av recording with metering, returns base64 + durationMs + waveform levels |
| Chat screen | `client/app/(app)/chat/[conversationId].tsx` | KeyboardAvoidingView (offset 100), message dedup by content+senderId, doodle background, partner alias header with tap-to-rename, voice note sending |
| Chat background | `client/src/components/chat/ChatBackground.tsx` | SVG line-art icon pattern (hearts, shields, chat bubbles, etc.) at 28% opacity using react-native-svg |
| Chat input | `client/src/components/chat/ChatInput.tsx` | Text input with send button; mic SVG icon when empty; recording state with timer + cancel/send |
| Message bubble | `client/src/components/chat/MessageBubble.tsx` | Routes voice messages to VoiceMessageBubble, text messages to standard bubble |
| Voice bubble | `client/src/components/chat/VoiceMessageBubble.tsx` | SVG play/pause icons, waveform bars from real audio metering data, dynamic width based on duration (45-85% screen), progress tracking during playback, temp file playback via expo-file-system File API |
| Confirm screen | `client/app/(app)/confirm.tsx` | AI analysis results, passes `category: "ai-prompt"` to queue |
| Queue screen | `client/app/(app)/queue/[category].tsx` | Custom display text for ai-prompt matches |
| Inbox | `client/app/(app)/(tabs)/inbox.tsx` | Unread indicators: blue tint, bold text, count badge. Shows nicknames if set. |
| Profile | `client/app/(app)/(tabs)/profile.tsx` | Privacy Notice, Terms, Complaints, Withdraw Consent, Delete Account, Log Out |
| Age Gate | `client/app/(auth)/age-gate.tsx` | DOB entry (DD/MM/YYYY), 18+ validation, blocks under-18 |
| Terms of Service | `client/app/(auth)/terms.tsx` | Scrollable ToS, checkbox acceptance, links to Privacy Notice |
| Consent | `client/app/(auth)/consent.tsx` | Explicit consent for sensitive data processing, decline option |
| Privacy Notice | `client/app/(auth)/privacy-notice.tsx` | Read-only, 11 sections, accessible without login |
| Compliance API | `client/src/api/compliance.api.ts` | confirmAge, acceptTerms, recordConsent, withdrawConsent, deleteAccount |
| App layout | `client/app/(app)/_layout.tsx` | Global message listener, nickname loading on mount |
| Colors | `client/src/theme/colors.ts` | Primary #29B6F6, Background #E3F2FD |

### Important Frontend Notes

- **expo-file-system**: SDK 54 deprecated the legacy API. Use `import { File, Paths } from "expo-file-system"` (new File class) or `import from "expo-file-system/legacy"`. For base64 encoding use `fetch` + `FileReader` blob approach instead of `readAsStringAsync`.
- **expo-av**: Recording uses `isMeteringEnabled: true` for waveform data. Use `LOW_QUALITY` preset to keep file sizes reasonable for Socket.IO transport.
- **Nicknames**: Stored client-side in AsyncStorage (`sympathy:nicknames`), keyed by conversationId. Shown in both chat header and inbox.
- **Registration flow**: Onboarding slides → Splash (auto-auth) → Age Gate (DOB) → Terms of Service (checkbox) → Consent (sensitive data) → App. Compliance state stored in AsyncStorage (`age_confirmed`, `terms_accepted_version`, `consent_recorded`). Root layout checks compliance state and routes returning users to the correct screen.
- **Account deletion**: Profile → "Delete My Account" → warning → confirmation → calls `DELETE /compliance/account` → clears AsyncStorage → logs out → redirects to onboarding.

## Error Handling

- `AppError` (base) — custom status + code
- `AuthError` — 401
- `ValidationError` — 400
- `NotFoundError` — 404
- `ForbiddenError` — 403
- `UpgradeRequiredError` — 403 with `{error: "upgrade_required", requiredTier, message}`
