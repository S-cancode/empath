# Moderator Operations Runbook

Operational procedures for Empath moderation. This documents **process**; it does not by itself constitute staffing or on-call coverage (those are owner commitments — see App Store external blockers).

## Accounts
- **Provision** a moderator: `npx tsx scripts/create-moderator.ts <email> <password> [admin]`. Prints a one-time TOTP setup URI — add it to an authenticator app immediately; the secret is shown once. Passwords are bcrypt-hashed; login requires email + password + TOTP.
- **Roles**: `moderator` (default) and `admin`. Admin is required for actions gated by `requireModeratorRole("admin")`.
- **Remove / disable**: set the moderator's `active=false` (or bump `tokenVersion`) in the DB — the next request/token check rejects them (`resolveModerator`).
- Sessions are short-lived (30 min JWT) with `tokenVersion` revocation.

## TOTP recovery
- Lost authenticator: an `admin` re-provisions the account (new secret/URI) after out-of-band identity confirmation. There is no self-service reset.

## Credential rotation
- Rotate a moderator password by re-provisioning or updating `passwordHash`. Bump `tokenVersion` to invalidate existing sessions.
- Rotate the review allowlist (`REVIEW_APPLE_SUBS`) and disable `REVIEW_MODE` after App Review completes.

## Access review
- Periodically (recommended monthly) review the `moderators` table for active accounts and the `moderator_audit_logs` table for unexpected access. Deactivate unused accounts.

## Suspicious-access response
- The append-only `moderator_audit_logs` records `login`, `login_failed`, `view_report`, `take_action`, `resolve_escalation`, and `play_reported_voice` with encrypted IP (never content/audio).
- On repeated `login_failed`, unexpected `play_reported_voice`, or off-hours access: deactivate the account (`active=false`), bump `tokenVersion`, rotate the password, and review the audit trail for the affected reports.

## Reported voice audio
- Play only via the dashboard's audited "Play" control (`GET /admin/reports/:id/voice/:messageId`), which streams the exact reported note with `Cache-Control: no-store` and records a `play_reported_voice` audit event. Audio is never in list/detail JSON and unreported voice is not browsable.

## Coverage during App Review
- A moderator must be reachable while the app is under review, and the review backend must stay up. Provide a named contact in App Store Connect.

## Escalation ownership
- `escalate` sets a one-way retention hold, a 7-day interim suspension, and notifies founders (`FOUNDER_PUSH_TOKENS`). Founder review resolves the escalation (records outcome; may lift the suspension) — the retention hold is never lifted.

## Incident records
- Keep a written record of any safety incident: report id(s), moderator, action taken, timestamps (from the audit log), and outcome. Retention of report/moderation records follows the retention policy (reports 12 months from resolution).

## Not covered by this document (owner commitments)
- Actual staffing / on-call schedule and response-time SLA.
- Legal/DPO sign-off, DPIA, Online Safety Act assessment.
