/**
 * DKY Study Hub - Cloudflare Worker
 * Environment bindings required:
 *   YOUTUBE_API_KEY (secret)
 *   ALLOWED_ORIGIN (plain text variable, e.g. https://YOUR-USERNAME.github.io)
 */
const CORS_BASE = {
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};
const CHAPTERS = {
  Physics: ["Units and Measurements", "Motion in a Straight Line", "Motion in a Plane", "Laws of Motion", "Work, Energy and Power", "System of Particles and Rotational Motion", "Gravitation", "Mechanical Properties of Solids", "Mechanical Properties of Fluids", "Thermal Properties of Matter", "Thermodynamics", "Kinetic Theory", "Oscillations", "Waves"],
  Chemistry: ["Some Basic Concepts of Chemistry", "Structure of Atom", "Classification of Elements and Periodicity in Properties", "Chemical Bonding and Molecular Structure", "Chemical Thermodynamics", "Equilibrium", "Redox Reactions", "Organic Chemistry: Some Basic Principles and Techniques", "Hydrocarbons"],
  Mathematics: ["Sets", "Relations and Functions", "Trigonometric Functions", "Complex Numbers and Quadratic Equations", "Linear Inequalities", "Permutations and Combinations", "Binomial Theorem", "Sequences and Series", "Straight Lines", "Conic Sections", "Introduction to Three-Dimensional Geometry", "Limits and Derivatives", "Statistics", "Probability"]
};
function json(data, status, cors = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors } });
}
function allowedCors(origin, env) {
  if (!origin || !env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN.trim()) return null;
  return { ...CORS_BASE, "Access-Control-Allow-Origin": origin };
}
function apiErrorMessage(data, status) {
  const reason = data?.error?.errors?.[0]?.reason;
  if (status === 403 && (reason === "quotaExceeded" || reason === "dailyLimitExceeded")) return "YouTube search quota has been reached. Please try again later.";
  if (status === 403 && (reason === "accessNotConfigured" || /has not been used|disabled/i.test(data?.error?.message || ""))) return "The YouTube Data API is not enabled for this service yet.";
  if (status === 400 || status === 403) return "The video service could not access YouTube. The site owner should check the API key and API restrictions.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  return "YouTube video search is temporarily unavailable. Please try again later.";
}
export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = allowedCors(origin, env);
    if (!cors) return json({ error: "This website origin is not allowed." }, 403, CORS_BASE);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405, cors);
    const url = new URL(request.url);
    if (url.pathname !== "/api/videos") return json({ error: "Not found." }, 404, cors);
    if (!env.YOUTUBE_API_KEY) return json({ error: "The video service is not configured yet. Please try again later." }, 503, cors);
    const subject = url.searchParams.get("subject") || "";
    const chapter = url.searchParams.get("chapter") || "";
    const kind = url.searchParams.get("kind") || "";
    if (!Object.hasOwn(CHAPTERS, subject) || !CHAPTERS[subject].includes(chapter) || !["lecture", "practice"].includes(kind)) {
      return json({ error: "Invalid subject, chapter, or content type." }, 400, cors);
    }
    // Cache successful responses for 30 minutes to reduce repeated YouTube quota usage.
    const cacheKey = new Request(`${url.origin}${url.pathname}?subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapter)}&kind=${encodeURIComponent(kind)}`, { method: "GET" });
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(cached.body, { status: cached.status, headers });
    }
    const focus = kind === "lecture"
      ? "full chapter lecture detailed explanation complete chapter concepts"
      : "question practice important questions solved questions NCERT exercise solutions numerical problems";
    const q = `Class 11 ${subject} ${chapter} ${focus} CBSE NCERT`;
    try {
      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      for (const [key, value] of Object.entries({ part: "snippet", q, type: "video", maxResults: "5", order: "relevance", key: env.YOUTUBE_API_KEY })) searchUrl.searchParams.set(key, value);
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json().catch(() => ({}));
      if (!searchResponse.ok) return json({ error: apiErrorMessage(searchData, searchResponse.status) }, 502, cors);
      const ids = (searchData.items || []).map(item => item.id?.videoId).filter(id => /^[A-Za-z0-9_-]{11}$/.test(id)).slice(0, 5);
      if (!ids.length) return json({ items: [] }, 200, { ...cors, "Cache-Control": "public, max-age=300" });
      const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      for (const [key, value] of Object.entries({ part: "snippet,statistics", id: ids.join(","), key: env.YOUTUBE_API_KEY })) detailsUrl.searchParams.set(key, value);
      const detailsResponse = await fetch(detailsUrl);
      const detailsData = await detailsResponse.json().catch(() => ({}));
      if (!detailsResponse.ok) return json({ error: apiErrorMessage(detailsData, detailsResponse.status) }, 502, cors);
      const byId = new Map((detailsData.items || []).map(item => [item.id, item]));
      const items = ids.map(id => byId.get(id)).filter(Boolean).map(video => ({
        id: video.id,
        title: video.snippet?.title || "Untitled video",
        channel: video.snippet?.channelTitle || "Channel unavailable",
        published: video.snippet?.publishedAt || "",
        views: video.statistics?.viewCount,
        thumb: video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.medium?.url || video.snippet?.thumbnails?.default?.url || "",
        description: video.snippet?.description || ""
      }));
      const response = json({ items }, 200, { ...cors, "Cache-Control": "public, max-age=1800" });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch {
      return json({ error: "A network error interrupted YouTube search. Please try again." }, 502, cors);
    }
  }
};
