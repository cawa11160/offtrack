# Offtrack Execution Roadmap

This roadmap turns the musician-first direction into shippable work. Each phase should be completed in order unless production incidents or user research prove a different priority.

## Phase 1: Lock the Product Loop

Goal: make the existing product feel like one musician-first workflow instead of many disconnected surfaces.

Done when:

- The primary product story is musician uploads -> listener discovery -> listener action -> musician analytics.
- Listener recommendations prioritize uploaded or claimed musician tracks when quality is comparable.
- Artist profiles expose clear listener conversion actions.
- Every play, like, save, profile open, Spotify click, merch click, and concert click is attributable to a track or artist.
- Mock-only surfaces are clearly marked, backed by real APIs, or removed from primary navigation.

Implementation notes:

- Start with uploads, recommendations, track detail, artist profile, and analytics.
- Treat merch, concerts, and lyric reels as secondary conversion surfaces until the core loop is reliable.
- Keep the listener experience clean, but measure success by musician outcomes.

## Phase 2: Production Readiness

Goal: make Offtrack safe enough for real musicians to trust with their work.

Done when:

- Audio storage uses configured remote object storage in production.
- Upload validation covers file type, size, duration, and failure recovery.
- Email delivery is wired for verification, password recovery, and important account events.
- Playback, upload, auth, and recommendation errors are observable.
- Rate limits exist for auth, uploads, feedback, search, recommendations, and media endpoints.
- Admin tools can lock abusive accounts, claim orphaned uploads, and inspect audit events.
- Deployment health checks cover API, database, catalog readiness, storage, and recommender readiness.

Implementation notes:

- Use the existing S3-compatible storage support as the production media path.
- Keep local disk only for development.
- Build operational dashboards before expanding beta access.

## Phase 3: Rights, Safety, and Trust

Goal: prevent Offtrack from becoming risky for musicians, listeners, or the business.

Done when:

- Signup and uploads require explicit confirmation that the musician owns or controls the uploaded audio.
- Terms, privacy policy, copyright policy, and takedown instructions exist and are linked in the app.
- Users can report tracks, artists, and profiles.
- Admins can review reports, unpublish content, and preserve audit history.
- Uploaded content has ownership metadata and moderation status.
- Spotify-backed playback is clearly separated from Offtrack-hosted artist uploads.

Implementation notes:

- Do not market Offtrack as unlimited streaming.
- Keep externally sourced catalog playback on Spotify links, previews, or embeds unless licensing changes.

## Phase 4: Artist Dashboard

Goal: give musicians enough insight to improve their music and promotion.

Done when:

- Musicians can view plays, listeners, likes, saves, and conversion clicks by track.
- Musicians can compare discovery sources: recommendations, search, profile, direct, and external links.
- Musicians can see recent listener activity without exposing private listener data.
- Musicians can edit profile calls to action.
- Musicians can identify which tracks are creating qualified listener connections.

Implementation notes:

- Prefer actionable metrics over vanity totals.
- Start with aggregated analytics already captured by feedback and playback events.
- Do not expose individual listener identity unless the listener opted in.

## Phase 5: Closed Beta

Goal: validate that musicians get real value before scaling.

Done when:

- 20 to 50 musicians have uploaded or claimed profiles.
- 200 to 500 listeners have used recommendations or search.
- Onboarding completion, upload success, first-play conversion, repeat listening, likes, and outbound clicks are measured.
- At least 10 musicians have reviewed their dashboard and given feedback.
- Product gaps are ranked by measured impact, not internal preference.

Implementation notes:

- Recruit one clear musician segment first.
- Keep support hands-on.
- Remove or hide low-value surfaces before increasing traffic.

## Phase 6: Monetization

Goal: earn revenue in a way that aligns with musician success.

Done when:

- A paid plan or transaction model is selected.
- The model is tied to musician value, not listener lock-in.
- Billing uses a real payment provider before production charges.
- Free-tier limits are clear and fair.
- Paid features improve discovery, analytics, conversion, or campaign control.

Preferred models:

- Musician subscription for advanced analytics and campaign tools.
- Commission on merch or ticket conversions.
- Paid release campaigns with transparent placement rules.

Avoid:

- Pay-to-win ranking that damages listener trust.
- Listener subscriptions before the musician value proposition is proven.
- Monetizing uploads without giving musicians useful outcomes.

## Current Product Bets

- Primary bet: independent musicians need a focused discovery and analytics loop more than another social profile page.
- Secondary bet: listeners will engage if recommendations surface tracks that feel personal and fresh.
- Business bet: musicians will pay when Offtrack proves it can create qualified listener connections.

