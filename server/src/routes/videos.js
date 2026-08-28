import { Router } from "express";

export const videosRouter = Router();

/**
 * GET /api/videos/:videoId
 *
 * Returns { videoId, title }. The frontend calls THIS endpoint instead of
 * ever talking to YouTube directly, so if a real YOUTUBE_API_KEY is added
 * later, it stays server-side only — never in frontend code, never in a
 * VITE_ variable (that would ship it straight to the browser).
 *
 * Right now this uses YouTube's public oEmbed endpoint, which needs no key
 * at all. If process.env.YOUTUBE_API_KEY is set, it's used instead via the
 * official Data API (videos.list) for richer/more reliable metadata.
 */
videosRouter.get("/api/videos/:videoId", async (req, res) => {
  const { videoId } = req.params;
  if (!/^[\w-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: "Invalid video id" });
  }

  try {
    if (process.env.YOUTUBE_API_KEY) {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`;
      const apiRes = await fetch(apiUrl);
      if (apiRes.ok) {
        const data = await apiRes.json();
        const title = data.items?.[0]?.snippet?.title;
        if (title) return res.json({ videoId, title });
      }
      // Falls through to oEmbed below if the Data API call didn't pan out.
    }

    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetch(oembedUrl);
    if (!oembedRes.ok) {
      return res.status(404).json({ error: "Title not found", videoId });
    }
    const data = await oembedRes.json();
    return res.json({ videoId, title: data.title ?? null });
  } catch (err) {
    console.error("[videos] title lookup failed:", err.message);
    return res.status(502).json({ error: "Could not fetch video title", videoId });
  }
});
