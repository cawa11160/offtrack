# Discovery Graph

The Discovery Graph is Offtrack's musician-first exploration surface. It should show listeners why a track is appearing, help independent uploads get fair tests, and give musicians a readable path from discovery to qualified fan actions.

## Product Job

The graph answers three questions:

- What does this listener's taste graph look like?
- Which under-discovered musician uploads are close enough to deserve exposure?
- What action should the listener or musician take next?

This is not a social graph or a generic catalog map. It is a working discovery system for turning listener signals into musician growth.

## Current Build

- `/api/profile/music-web` returns listener history, artist nodes, genre nodes, and playable musician upload candidates.
- Upload candidates require a published upload with a full audio asset.
- Candidates are ranked by listener artist and genre fit when available, then by recency for cold-start fairness.
- Candidate nodes include `audioUrl`, `sourceType`, `isDiscoveryCandidate`, `discoveryReason`, and `discoveryScore`.
- The frontend has three graph modes:
  - Taste: listening history and taste links
  - Discover: under-discovered playable musician uploads near the listener graph
  - Artist: musician uploads and growth paths
- Listener actions from the graph are sent through `/api/feedback` with `sourcePage=discovery_graph`.

## Musician-First Rules

- Do not recommend uploads that cannot be played.
- Keep a cold-start lane for new musicians with no historical signals.
- Use negative feedback to reduce exposure quickly.
- Use completions, saves, likes, artist clicks, and follows to expand exposure.
- Show why a candidate appeared in plain language.
- Treat raw plays as weak evidence unless they create qualified listener actions.

## Next Steps

1. Add a graph-specific exposure ledger so each upload has a controlled daily test budget.
2. Add listener explanation chips on every upload recommendation: matched genre, new upload, strong completion signal, or cold-start test.
3. Add artist-side graph analytics showing which genres, tracks, and listener segments created qualified connections.
4. Add admin controls to pause an upload from discovery, inspect skip/completion rates, and roll back bad recommender artifacts.
5. Add online learning jobs that update candidate ranking from fresh feedback without retraining the full model on every event.
6. Add A/B guardrails: upload discovery share, listener skip rate, completion rate, save rate, and artist conversion rate.
7. Add privacy-safe listener cohorts so musicians see aggregate fit without exposing individual listener identity.

## Success Metric

The graph should improve qualified musician-listener connections per uploaded track without increasing listener skips or negative feedback.
