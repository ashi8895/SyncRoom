import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

let apiLoadPromise: Promise<void> | null = null;

/** Loads the YouTube IFrame API script exactly once, however many players are on the page. */
function loadYouTubeAPI(): Promise<void> {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve();
  });
  return apiLoadPromise;
}

interface UseYouTubePlayerOptions {
  containerId: string;
  onLocalPlay: (currentTime: number) => void;
  onLocalPause: (currentTime: number) => void;
  onLocalSeek: (time: number) => void;
}

/**
 * Wraps the YouTube IFrame Player API and exposes a small imperative
 * handle. Consumers set `player.current.suppressNextEvent()` before
 * applying a *remote* state change, so that re-applying it doesn't
 * bounce straight back to the server as if the local user did it
 * (that feedback loop is the #1 bug in sync apps like this).
 */
export function useYouTubePlayer({
  containerId,
  onLocalPlay,
  onLocalPause,
  onLocalSeek,
}: UseYouTubePlayerOptions) {
  const playerRef = useRef<any>(null);
  const suppressUntilRef = useRef(0);
  const lastKnownStateRef = useRef<number | null>(null);
  // Tracks whether the underlying YT.Player has actually fired onReady.
  // Consumers must wait for this before calling loadVideo/play/etc, otherwise
  // a late-joining participant's first sync_state arrives before their
  // player exists yet, silently no-ops, and the video never loads.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let destroyed = false;

    loadYouTubeAPI().then(() => {
      if (destroyed) return;
      playerRef.current = new window.YT.Player(containerId, {
        height: "100%",
        width: "100%",
        playerVars: {
          playsinline: 1,
          rel: 0,
          // Hide every native YouTube UI element (progress bar, play/pause
          // button, settings gear, fullscreen, related videos, captions
          // button, branding). All playback goes through our own custom
          // buttons instead, so nobody — not even the Host — can bypass
          // the server-side sync by clicking YouTube's own controls.
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          cc_load_policy: 0,
        },
        events: {
          onReady: () => {
            if (!destroyed) setReady(true);
          },
          onError: (e: any) => {
            // 2 = invalid video id, 5 = HTML5 player error, 100 = video not found/private,
            // 101/150 = embedding disabled by the video owner.
            console.error("YouTube player error code:", e?.data);
          },
          onStateChange: (e: any) => {
            if (Date.now() < suppressUntilRef.current) {
              // This event was caused by our own remote-sync call (which can
              // fire more than one state-change in a row — e.g. seek then
              // play) — ignore anything inside the suppression window.
              return;
            }
            const YTState = window.YT.PlayerState;
            const time = playerRef.current?.getCurrentTime?.() ?? 0;

            if (e.data === YTState.PLAYING) onLocalPlay(time);
            else if (e.data === YTState.PAUSED) onLocalPause(time);

            lastKnownStateRef.current = e.data;
          },
        },
      });
    });

    return () => {
      destroyed = true;
      setReady(false);
      playerRef.current?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  return {
    /** True once the YT.Player instance is actually usable. */
    ready,
    /** Call right before programmatically driving the player from a server sync event. */
    suppressNextEvent: (windowMs = 1200) => {
      suppressUntilRef.current = Date.now() + windowMs;
    },
    loadVideo: (videoId: string, startSeconds = 0) => {
      playerRef.current?.loadVideoById?.({ videoId, startSeconds });
    },
    play: () => playerRef.current?.playVideo?.(),
    pause: () => playerRef.current?.pauseVideo?.(),
    seekTo: (seconds: number) => playerRef.current?.seekTo?.(seconds, true),
    getCurrentTime: (): number => playerRef.current?.getCurrentTime?.() ?? 0,
    getDuration: (): number => playerRef.current?.getDuration?.() ?? 0,
    onLocalSeekRequest: onLocalSeek,
  };
}
