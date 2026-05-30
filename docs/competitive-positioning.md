# Competitive Positioning

Offtrack should not compete as a general streaming catalog. Spotify, Apple Music,
YouTube Music, and SoundCloud already have catalog scale, distribution gravity,
and listener habits. Offtrack's wedge is narrower:

> Offtrack is the musician-first discovery platform where independent artists get
> fair exposure, transparent analytics, and tools to turn listeners into fans.

## Market Read

Streaming dominates recorded music revenue and listener behavior. That makes
discovery systems powerful, but it also makes them hard for early musicians to
influence.

Observed gaps:

- broad streaming products optimize primarily for listener retention and catalog
  consumption
- algorithmic recommendations can over-expose already popular artists
- paid or commissioned discovery tools can disadvantage early musicians
- artist dashboards often report what happened, but do not explain what to do
  next
- upload-first platforms help musicians publish, but do not always provide
  transparent listener-fit and conversion loops

## Competitor Read

### Spotify

Strengths:

- default listening habit for many users
- strong personalization and playlist ecosystem
- Spotify for Artists, campaign tools, Canvas, Marquee, Discovery Mode, and
  playlist pitching

Weakness for Offtrack to exploit:

- discovery is opaque to artists
- Discovery Mode is not available to every artist and can involve a commission
  on recording royalties in eligible recommendation contexts
- early musicians still need external momentum before the platform works for
  them
- playlist and algorithm incentives can push artists toward system-friendly
  tracks rather than durable fan relationships

### Apple Music

Strengths:

- premium brand and listener base
- artist analytics, Shazam insights, milestones, promotional assets, profile
  management, and concert visibility

Weakness for Offtrack to exploit:

- strong measurement layer, but weaker cold-start discovery workflow for unknown
  musicians
- artist tools tell musicians what happened, but less often turn that into a
  guided growth loop

### SoundCloud

Strengths:

- creator-native culture
- uploads, fan-powered royalties, direct fan support, merch/distribution
  positioning
- closer to independent musicians than Spotify or Apple

Weakness for Offtrack to exploit:

- discovery can still feel feed/search driven rather than accountable
  recommender driven
- artist analytics and fan conversion can be made more guided, measurable, and
  tied directly to each discovery test

## Offtrack's Difference

Offtrack should win by combining three things:

1. **Fair discovery**
   Every quality musician upload gets a real chance to be tested with likely
   listeners. Discovery should not be pay-to-play.

2. **Discovery with receipts**
   Musicians see why a track was tested, who responded in aggregate, what actions
   happened, and what the next move should be.

3. **Fan conversion**
   A play is not the finish line. Offtrack should guide listeners toward saves,
   follows, artist profiles, merch, tickets, direct support, email signup, and
   external streaming only when those actions help the musician.

## Product Pillars

### 1. Musician Profile Hub

The profile is the musician command center:

- identity
- uploads
- listening graph
- discovery score
- artist dashboard
- conversion links
- next recommended actions

Uploads and artist analytics should live inside profile, not as disconnected
primary navigation items.

### 2. Discovery Score

Each uploaded track should have a score that answers:

- is the track ready for discovery?
- did listeners complete it?
- did they save, like, or click through?
- did they skip or reject it?
- does it need more exposure before judging quality?
- what should the musician do next?

The score is not a vanity metric. It is a workflow guide.

### 3. Fair Exposure Engine

The recommender should reserve room for under-discovered musician uploads while
protecting listener trust.

Required constraints:

- every recommended upload must be playable
- exposure should be capped until early signals justify more reach
- negative feedback must quickly reduce exposure
- strong saves, completions, and artist clicks should expand exposure
- admins should see upload exposure, skip rate, completion rate, conversion rate,
  and rollback controls

### 4. Fan Conversion Layer

Artist profiles and track pages should include musician-owned outcomes:

- follow artist
- save track
- join mailing list
- support/tip
- merch
- tickets
- external stream
- share discovery card

The dashboard should measure each conversion path by source.

### 5. Transparent Recommender

Listeners should understand why a recommendation appears. Musicians should
understand why a track was tested. Admins should understand whether the system is
helping musicians without harming listener trust.

## What Not To Do

- Do not market Offtrack as a full-catalog Spotify replacement.
- Do not make musicians pay for rank unless placement rules are transparent and
  listener trust is protected.
- Do not optimize only for raw plays.
- Do not bury musician tools behind generic app navigation.
- Do not expand into merch, tickets, or social features unless they close the
  discovery-to-fan loop.

## Next Build Sequence

1. Finish the profile hub: profile, uploads, and dashboard as one musician
   command center.
2. Ship Discovery Score on uploads and artist dashboard.
3. Add profile conversion links and track them as first-class events.
4. Add fair exposure controls to the recommender dashboard.
5. Add listener-facing explanation chips for musician upload recommendations.
6. Build the Discovery Graph into the listener and artist workflow.
7. Add shareable discovery cards for artists.
8. Add beta success dashboard around qualified musician-listener connections.

## North Star

Qualified musician-listener connections per uploaded track.

A qualified connection means a listener discovered a musician through Offtrack
and then completed a meaningful action: full play, save, like, follow, profile
open, artist click, merch click, ticket click, direct support, email signup, or
external stream.
