import { useEffect, useRef, useState } from "react";
import { useYouTubePlayer } from "../hooks/useYouTubePlayer";
import { useVideoTitle } from "../hooks/useVideoTitle";
import type { PlaybackState } from "../types";

interface Props {
  playback: PlaybackState;
  canControl: boolean;
  onPlay: (currentTime: number) => void;
  onPause: (currentTime: number) => void;
  onSeek: (time: number) => void;
  onChangeVideo: (videoId: string) => void;
}

/** Pulls the 11-char video id out of any common YouTube URL shape, or passes through a bare id. */
function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1);
    if (url.searchParams.has("v")) return url.searchParams.get("v");
  } catch {
    /* not a URL */
  }
  return null;
}

/**
 * playback.currentTime is a snapshot taken at playback.lastUpdated — if the
 * video is still playing, real elapsed time has moved on since then. Add it
 * back so a client applying this state (on join, or on any sync_state)
 * lands at the actual current position instead of wherever it was when the
 * last event fired.
 */
function effectiveTime(playback: PlaybackState): number {
  if (playback.playState !== "playing") return playback.currentTime;
  const elapsed = (Date.now() - playback.lastUpdated) / 1000;
  return playback.currentTime + Math.max(0, elapsed);
}

const DRIFT_TOLERANCE_SECONDS = 1.5;
const DRIFT_CHECK_INTERVAL_MS = 5000;

export function VideoPlayer({ playback, canControl, onPlay, onPause, onSeek, onChangeVideo }: Props) {
  const [videoInput, setVideoInput] = useState("");
  const appliedVideoId = useRef<string | null>(null);
  // Tracks the last playback.lastUpdated value we've already applied to the
  // real player, so we don't re-apply the same state on every re-render —
  // but crucially, DOES react to seek-only updates (see effect below).
  const appliedUpdateRef = useRef<number | null>(null);

  // Seek bar: shows live progress for everyone, but is only draggable for
  // Host/Moderator. `scrubTime` is non-null only while actively dragging —
  // during a drag we show the dragged position instead of the live one, and
  // only commit (seek + broadcast) on release, not on every pixel of drag.
  const [liveTime, setLiveTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  const player = useYouTubePlayer({
    containerId: "yt-player",
    onLocalPlay: onPlay,
    onLocalPause: onPause,
    onLocalSeek: onSeek,
  });
  const { title: videoTitle, isLoading: titleLoading } = useVideoTitle(playback.videoId);

  // Apply remote (server) state to the actual player, suppressing the
  // events it will fire so we don't immediately re-broadcast our own echo.
  // Waits for player.ready — otherwise a participant who joins after the
  // host already loaded a video would receive sync_state before their own
  // YT.Player instance exists, and the load call would silently no-op.
  //
  // This depends on playback.lastUpdated (not just videoId/playState)
  // because a seek doesn't change either of those — only currentTime and
  // lastUpdated move — so without this the effect would never re-run for
  // a seek-only broadcast and other clients' video would just keep
  // playing at the old position.
  useEffect(() => {
    if (!playback.videoId || !player.ready) return;
    if (appliedUpdateRef.current === playback.lastUpdated) return;

    const isNewVideo = appliedVideoId.current !== playback.videoId;
    const targetTime = effectiveTime(playback);

    player.suppressNextEvent();

    if (isNewVideo) {
      // loadVideoById auto-plays; if the room's actual state is paused,
      // pause immediately after so we don't briefly play out of sync.
      player.loadVideo(playback.videoId, targetTime);
      if (playback.playState !== "playing") player.pause();
      appliedVideoId.current = playback.videoId;
    } else {
      player.seekTo(targetTime);
      if (playback.playState === "playing") player.play();
      else player.pause();
    }

    appliedUpdateRef.current = playback.lastUpdated;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.lastUpdated, playback.videoId, player.ready]);

  // Periodic drift correction: while playing, every few seconds compare
  // where this client's player actually is against where the server-timed
  // position should be, and nudge it back in line if it's drifted too far
  // (different machines run their video clocks at very slightly different
  // real speeds over a long session).
  useEffect(() => {
    if (playback.playState !== "playing" || !player.ready) return;
    const interval = setInterval(() => {
      const expected = effectiveTime(playback);
      const actual = player.getCurrentTime();
      if (Math.abs(expected - actual) > DRIFT_TOLERANCE_SECONDS) {
        player.suppressNextEvent();
        player.seekTo(expected);
      }
    }, DRIFT_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.playState, playback.lastUpdated, player.ready]);

  // Drives the seek bar's fill + time display for EVERYONE (Participants
  // see it move too, they just can't drag it). While the user is actively
  // dragging (scrubTime !== null), this stops overwriting the displayed
  // value so the thumb doesn't jump around under their finger.
  useEffect(() => {
    if (!player.ready) return;
    const interval = setInterval(() => {
      if (scrubTime === null) setLiveTime(player.getCurrentTime());
      const d = player.getDuration();
      if (d > 0) setDuration(d);
    }, 500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.ready, scrubTime]);

  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function commitSeek(time: number) {
    player.suppressNextEvent();
    player.seekTo(time);
    onSeek(time);
    setLiveTime(time);
    setScrubTime(null);
  }

  function handleLoadVideo() {
    const id = extractVideoId(videoInput);
    if (!id) return;
    onChangeVideo(id);
    setVideoInput("");
  }

  function handleSeekBy(deltaSeconds: number) {
    const target = Math.max(0, player.getCurrentTime() + deltaSeconds);
    player.suppressNextEvent();
    player.seekTo(target);
    onSeek(target);
  }

  return (
    <div className="player-panel">
      {playback.videoId && (
        <div className="now-playing">
          <span className="eyebrow">Now playing</span>
          {titleLoading && <p className="now-playing-loading">Loading title…</p>}
          {!titleLoading && videoTitle && <p>{videoTitle}</p>}
          {!titleLoading && !videoTitle && <p className="now-playing-loading">{playback.videoId}</p>}
        </div>
      )}
      <div className="player-frame">
        <div id="yt-player" />
        {!canControl && playback.videoId && (
          // Blocks all clicks/taps from reaching the embedded iframe, so a
          // Participant can't toggle play/pause locally on their own screen
          // even though YouTube's own control bar is already hidden.
          <div className="player-guard" aria-hidden="true" />
        )}
        {!playback.videoId && (
          <div className="player-empty">
            <span className="eyebrow">No feature presented</span>
            <p>Paste a YouTube link below to start the show.</p>
          </div>
        )}
      </div>

      {canControl && (
        <div className="controls-row">
          <input
            className="video-input"
            placeholder="Paste a YouTube URL or video ID"
            value={videoInput}
            onChange={(e) => setVideoInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLoadVideo()}
          />
          <button className="btn btn-marquee" onClick={handleLoadVideo}>
            Load
          </button>
        </div>
      )}

      {playback.videoId && (
        <div className="seek-bar-row">
          <span className="seek-time">{formatTime(scrubTime ?? liveTime)}</span>
          <input
            type="range"
            className="seek-bar"
            min={0}
            max={duration || 0}
            step={0.5}
            value={scrubTime ?? liveTime}
            disabled={!canControl}
            onChange={(e) => setScrubTime(Number(e.target.value))}
            onMouseUp={() => scrubTime !== null && commitSeek(scrubTime)}
            onTouchEnd={() => scrubTime !== null && commitSeek(scrubTime)}
            aria-label="Seek"
          />
          <span className="seek-time">{formatTime(duration)}</span>
        </div>
      )}

      {canControl && playback.videoId && (
        <div className="controls-row">
          <button className="btn" onClick={() => handleSeekBy(-10)}>
            ⟲ 10s
          </button>
          <button
            className="btn btn-marquee"
            onClick={() => {
              player.suppressNextEvent();
              if (playback.playState === "playing") {
                player.pause();
                onPause(player.getCurrentTime());
              } else {
                player.play();
                onPlay(player.getCurrentTime());
              }
            }}
          >
            {playback.playState === "playing" ? "Pause" : "Play"}
          </button>
          <button className="btn" onClick={() => handleSeekBy(10)}>
            10s ⟳
          </button>
        </div>
      )}

      {!canControl && (
        <p className="hint-text">Only the Host or a Moderator can run the projector.</p>
      )}
    </div>
  );
}
