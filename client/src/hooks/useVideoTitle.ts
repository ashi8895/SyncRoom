import { useEffect, useState } from "react";
import { SERVER_URL } from "../socket";

interface VideoTitleState {
  title: string | null;
  isLoading: boolean;
}

/**
 * Fetches the real video title through OUR backend (GET /api/videos/:id)
 * rather than calling YouTube directly from the browser. This keeps the
 * lookup server-side, so if a real YOUTUBE_API_KEY is ever configured
 * (server/src/routes/videos.js), it never has to touch frontend code or a
 * VITE_ environment variable — both of which ship straight to the browser.
 *
 * Returns isLoading=true while the fetch is in flight, and title=null on
 * any failure (private/deleted video, offline, server down) — callers
 * should show a loading state and fall back to hiding the title on error.
 */
export function useVideoTitle(videoId: string | null): VideoTitleState {
  const [title, setTitle] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!videoId) {
      setTitle(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setTitle(null);
    setIsLoading(true);

    fetch(`${SERVER_URL}/api/videos/${videoId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.title) setTitle(data.title);
      })
      .catch(() => {
        /* silently ignore — title is a nice-to-have, not critical */
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  return { title, isLoading };
}
