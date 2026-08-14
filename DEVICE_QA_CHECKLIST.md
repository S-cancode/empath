# Physical-iPhone QA Checklist

Native QA for the v1 build. **Every item is pending until a person executes it on real hardware** — none are auto-verified. Simulator can exercise some flows; microphone/voice/push require a physical device. Run against a review/preview build (`EXPO_PUBLIC_API_URL` = production backend).

## Auth & compliance
- [ ] Sign in with Apple completes; a nickname (not name/email) is shown to peers.
- [ ] Under-18 date of birth is blocked at the age gate.
- [ ] Terms and sensitive-data consent are required before matching/messaging.
- [ ] Launch after refresh-token expiry recovers into a usable signed-in state (or a clean re-auth).

## Matching
- [ ] Prompt → analysis → confirm shows the three preference selectors; defaults visible.
- [ ] Join submits the versioned profile; a match proposal can be accepted.
- [ ] Queue persistence: leave the screen and return, still queued; proposal expiry re-queues.
- [ ] Two explicitly incompatible seekers do not pair (needs two accounts).

## Text messaging
- [ ] Send / receive / read receipts work in real time.
- [ ] Neutral push arrives on the lock screen ("You have a new message" — no content).

## Voice notes (physical device required)
- [ ] First mic use shows the voice-privacy notice; declining leaves text chat fully usable and never prompts for mic.
- [ ] Granting mic → record → send → the note appears for the recipient after the safety check.
- [ ] Deny mic permission → clear explanation + "Open Settings"; text still works.
- [ ] Transcription/safety failure or timeout → the note is NOT delivered; a retry/timeout message shows; the send lock clears.
- [ ] Disconnect mid-send → the send lock clears (no permanent "sending").
- [ ] Temp recording/playback files are cleaned; audio mode returns to normal after recording/playback.

## Reporting, blocking, moderation
- [ ] Long-press a text message → Report; long-press a voice note → Report.
- [ ] Moderator dashboard: the reported voice note has an audited "Play" control that plays only that note; unreported voice is not browsable.
- [ ] Block a user → they can no longer reach you; existing conversation blocked.
- [ ] Ban enforcement (via moderator): banned account is signed out and cannot re-enter.

## Other
- [ ] Translation consent gate: auto-translate cannot be enabled without accepting the notice.
- [ ] Crisis phrase shows resources privately to the sender; country selection changes the resource set; unknown country → international fallback.
- [ ] Archive / reconnect flow.
- [ ] Account deletion (Profile) removes access; a deleted account cannot be resurrected on re-sign-in.
- [ ] Account deletion with Apple credentials configured revokes Sign in with Apple (the app says deleted with no manual step); with a legacy/unconfigured account it deletes locally AND shows the manual "Stop Using Apple ID" guidance (never a false "revoked").

## Reviewer demo path (store-review build)
- [ ] Build with the `store-review` EAS profile (store distribution, `EXPO_PUBLIC_REVIEW_MODE=true`). In a non-review build, Profile shows NO "App Review Access" row.
- [ ] With `REVIEW_MODE=true` + a `REVIEW_ACCESS_CODE` set on the backend: Profile → App Review Access → enter the code → a "Demo Peer (scripted…)" conversation appears in the Inbox. A wrong code is rejected; before redeeming, no demo conversation exists.
- [ ] The demo conversation contains a playable incoming voice note; long-press it → Report; the moderator dashboard can play only that exact reported note.
- [ ] Report or Block the demo peer, then force-quit and relaunch — the conversation stays blocked/terminal (no new active demo relationship is created).

## Soak (unpaid TestFlight)
- [ ] Internal TestFlight distribution to a small unpaid group (no compensation — Apple 2.2). Watch Sentry + backend logs over ~48h for crashes, stuck sends, moderation errors.
