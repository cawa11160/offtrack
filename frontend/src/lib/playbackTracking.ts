import { useCallback, useEffect, useMemo, useRef } from "react";

import { apiFeedback } from "./api";

export type PlaybackMilestoneTrack = {
  id?: string | null;
  title?: string;
  artist?: string;
  sourceKind?: "upload" | "preview" | "spotify" | "unknown";
  recommendationRequestId?: string;
  recommendationRank?: number;
};

type PlaybackState = {
  track: PlaybackMilestoneTrack | null;
  started: boolean;
  sentThirty: boolean;
  completed: boolean;
  lastPositionMs: number;
  durationMs?: number;
};

const emptyState: PlaybackState = {
  track: null,
  started: false,
  sentThirty: false,
  completed: false,
  lastPositionMs: 0,
};

export function usePlaybackMilestones(sourcePage: string) {
  const stateRef = useRef<PlaybackState>({ ...emptyState });

  const resetForTrack = useCallback((track: PlaybackMilestoneTrack | null, durationMs?: number) => {
    stateRef.current = {
      ...emptyState,
      track,
      durationMs,
    };
  }, []);

  const send = useCallback(
    (event: "play_start" | "play_30s" | "play_complete" | "skip", state: PlaybackState) => {
      const trackId = (state.track?.id || "").trim();
      if (!trackId) return;
      void apiFeedback(trackId, event, {
        durationMs: state.durationMs,
        playPositionMs: state.lastPositionMs,
        sourcePage,
        recommendationRequestId: state.track?.recommendationRequestId,
        recommendationRank: state.track?.recommendationRank,
        extra: {
          title: state.track?.title,
          artist: state.track?.artist,
          sourceKind: state.track?.sourceKind || "unknown",
        },
      });
    },
    [sourcePage]
  );

  const start = useCallback(
    (track: PlaybackMilestoneTrack, durationMs?: number) => {
      const nextId = (track.id || "").trim();
      if (!nextId) return;
      if (stateRef.current.track?.id !== nextId) {
        resetForTrack(track, durationMs);
      }
      const state = stateRef.current;
      state.track = track;
      state.durationMs = durationMs ?? state.durationMs;
      if (!state.started) {
        state.started = true;
        send("play_start", state);
      }
    },
    [resetForTrack, send]
  );

  const progress = useCallback(
    (positionSeconds: number, durationSeconds?: number) => {
      const state = stateRef.current;
      if (!state.track?.id || !state.started) return;
      const posMs = Math.max(0, Math.floor((positionSeconds || 0) * 1000));
      const durMs = Number.isFinite(durationSeconds || 0) && durationSeconds ? Math.floor((durationSeconds || 0) * 1000) : state.durationMs;
      state.lastPositionMs = posMs;
      state.durationMs = durMs;

      const crossedThirty = posMs >= 30000;
      const crossedPreviewMeaningful = Boolean(durMs && durMs > 0 && posMs / durMs >= 0.55 && posMs >= 10000);
      if (!state.sentThirty && (crossedThirty || crossedPreviewMeaningful)) {
        state.sentThirty = true;
        send("play_30s", state);
      }
    },
    [send]
  );

  const complete = useCallback(() => {
    const state = stateRef.current;
    if (!state.track?.id || !state.started || state.completed) return;
    state.completed = true;
    send("play_complete", state);
  }, [send]);

  const skip = useCallback(() => {
    const state = stateRef.current;
    if (!state.track?.id || !state.started || state.completed) return;
    if (state.lastPositionMs >= 3000) {
      send("skip", state);
    }
    stateRef.current = { ...emptyState };
  }, [send]);

  useEffect(() => {
    return () => {
      skip();
    };
  }, [skip]);

  return useMemo(
    () => ({ start, progress, complete, skip, resetForTrack }),
    [start, progress, complete, skip, resetForTrack]
  );
}
