// Minimal Bluesky stream endpoint for Vercel /api routes
// GET /api/bsky/stream?queries=Name|Nickname|KD&reporters=handle1,handle2&days=7
export const config = { runtime: "edge" };

const APPVIEW = "https://public.api.bsky.app/xrpc";

// Helpers
const u = (p, q) => APPVIEW + p + "?" + new URLSearchParams(q).toString();
const uniqBy = (arr, key) => [...new Map(arr.map(o => [key(o), o])).values()];
const daysAgo = (n) => new Date(Date.now() - n*24*60*60*1000);

async function resolveHandle(handle) {
  const url = u("/com.atproto.identity.resolveHandle", { handle });
  const r = await fetch(url);
  if (!r.ok) throw new Error("resolveHandle failed for " + handle);
  const j = await r.json();
  return j.did; // DID for the handle
}

function normalize(view) {
  // Works with searchPosts (PostView) and getAuthorFeed (FeedViewPost)
  const v = view.post ? view.post : view;
  const uri = v?.uri || "";
  const rkey = uri.split("/").pop();
  const authorHandle = v?.author?.handle || "";
  const createdAt = v?.record?.createdAt || v?.indexedAt || v?.post?.record?.createdAt || v?.post?.indexedAt;
  const text = v?.record?.text || "";
  // Build a bsky.app URL (oEmbed supports these)
  const url = (authorHandle && rkey)
    ? `https://bsky.app/profile/${authorHandle}/post/${rkey}`
    : null;
  return { uri, url, createdAt, text, authorHandle };
}

function matchText(txt, terms) {
  const s = (txt || "").toLowerCase();
  return terms.some(t => s.includes(t));
}

async function searchByTermAndAuthor(term, did, limit=25) {
  // Primary: app.bsky.feed.searchPosts (may be rate limited sometimes)
  const sp = u("/app.bsky.feed.searchPosts", { q: term, author: did, limit: String(limit), sort: "latest" });
  const res = await fetch(sp);
  if (res.ok) {
    const j = await res.json();
    return (j.posts || []).map(normalize);
  }
  // Fallback: getAuthorFeed then text-filter locally
  const gf = u("/app.bsky.feed.getAuthorFeed", { actor: did, limit: "50" });
  const r2 = await fetch(gf);
  if (!r2.ok) return [];
  const j2 = await r2.json();
  return (j2.feed || []).map(normalize);
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const rawQueries = (searchParams.get("queries") || "").trim();
  const reporters = (searchParams.get("reporters") || "").trim();
  const days = parseInt(searchParams.get("days") || "7", 10);

  if (!rawQueries) {
    return new Response(JSON.stringify({ error: "Missing ?queries=" }), { status: 400 });
  }
  const terms = rawQueries.split("|").map(s => s.trim().toLowerCase()).filter(Boolean);
  const since = daysAgo(isNaN(days) ? 7 : days);

  // reporters can be passed per request; if omitted, edit DEFAULT_REPORTERS below
  const DEFAULT_REPORTERS = [
    // "handle1.bsky.social", "handle2.bsky.social"
  ];
  const handles = (reporters ? reporters.split(",") : DEFAULT_REPORTERS)
    .map(s => s.trim()).filter(Boolean);

  // Resolve handles → DIDs (cacheable)
  const dids = [];
  for (const h of handles) {
    try { dids.push({ handle: h, did: await resolveHandle(h) }); }
    catch { /* skip bad handle */ }
  }

  // Gather posts per DID × term
  let out = [];
  for (const { did } of dids) {
    for (const term of terms) {
      try {
        const views = await searchByTermAndAuthor(term, did);
        for (const v of views) out.push(v);
      } catch { /* ignore */ }
    }
  }

  // Filter: last N days + keyword match (covers fallback path)
  out = out.filter(p => {
    const t = p.createdAt ? new Date(p.createdAt) : null;
    const inWindow = t ? (t >= since) : false;
    return p.url && inWindow && matchText(p.text, terms);
  });

  // Dedupe, sort latest first
  out = uniqBy(out, p => p.uri).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  const body = JSON.stringify({ posts: out.map(p => ({ url: p.url, createdAt: p.createdAt })) });

  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // CDN cache for 5 minutes; keeps load tiny and plays nice with rate limits
      "cache-control": "s-maxage=300, stale-while-revalidate=300"
    }
  });
}
