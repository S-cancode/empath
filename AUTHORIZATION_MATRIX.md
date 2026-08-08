# Authorization Matrix

Every state-changing event verifies **actor → object → membership → allowed state** before moderation, persistence, notification, or room emission. Verified at commit on branch `app-store-readiness` (Wave 2d).

Order of checks on content events: **authentication → compliance → object authorization → moderation (crisis) → persistence → delivery → neutral notification.**

## Socket.IO events (`src/chat/chat.gateway.ts`)

| Event | Actor auth | Compliance | Object membership check | Notes |
|---|---|---|---|---|
| handshake | JWT | full gate | — | rejects deleted/banned/suspended/underage/terms/consent |
| conversation:join | ✓ | (connect) | `assertActiveConversationParticipant` | |
| conversation:message | ✓ | per-event | `assertActiveConversationParticipant` **before** crisis + persist | crisis-after-authz fixed |
| conversation:voice-note | ✓ | per-event | `sendVoiceNote` → `getConversation(id, sender)` participant check | (voice removed in Wave 3) |
| message:read | ✓ | (connect) | `assertConversationParticipant` before receipt emit | added |
| message:delivered | ✓ | (connect) | `markDelivered` filters `NOT senderId` + `deliveryStatus:sent`; updates only messages addressed to actor | idempotent, no cross-tenant write |
| typing | ✓ | (connect) | room-scoped: `socket.to(room)` only reaches a room the actor joined (join is authorized) | |
| livesession:invite | ✓ | (connect) | `assertActiveConversationParticipant` **before** deriving partner | fixed neither-A-nor-B partner bug |
| livesession:accept | ✓ | (connect) | invite exists + `assertActiveConversationParticipant` | added membership check |
| livesession:decline | ✓ | (connect) | invite exists (in-memory, keyed by conversation) | |
| livesession:join | ✓ | (connect) | `session.conversation` participant check (inline) | |
| livesession:message | ✓ | per-event | `assertLiveSessionParticipant` + session↔conversation match **before** crisis + buffer | added |
| livesession:extend | ✓ | (connect) | `assertLiveSessionParticipant` | added |
| livesession:end | ✓ | (connect) | `assertLiveSessionParticipant` | added |
| match:accept | ✓ | per-event | `acceptProposal` Lua verifies actor ∈ {userAId,userBId} | |
| match:decline | ✓ | (connect) | `declineProposal` verifies actor ∈ {userAId,userBId} | **P0 fixed** — was mutable by non-participant |
| push:active / push:inactive | ✓ | (connect) | actor-scoped push suppression only, no object mutation | |

## REST (participant/object checks in handlers or services)

| Route | Check |
|---|---|
| /conversations/:id/* | router `requireCompliance`; service `getConversation(id, userId)` participant check |
| /safety/report, /block | reporter/blocker = actor; report requires conversation membership |
| /safety/block/:blockedUserId (DELETE) | **directional-block fix pending Wave 3** — currently deletes both directions |
| /admin/* | `adminAuth` (shared secret — individual identity pending Wave 4/Phase 8) |

## Negative tests

- `src/chat/authz.test.ts` — non-participant and arbitrary-id rejection for conversation/active-conversation/live-session helpers.
- `src/matching/matching.test.ts` — "ignores a decline from a non-participant, leaving the proposal intact" (proposal + both pending markers survive; nobody re-queued).

## Known residual (tracked, not in Wave 2)

- DELETE /safety/block/:blockedUserId bidirectional deletion → Wave 3 (Phase 6A).
- Admin shared-secret → individual moderator identity/MFA/audit → Wave 4 (Phase 8).
