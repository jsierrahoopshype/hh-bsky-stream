// /api/bsky/stream.js
// Minimal Bluesky stream endpoint for Vercel /api routes
// Example: /api/bsky/stream?queries=Luka|Doncic&days=7

export const config = { runtime: "edge" };

import { REPORTERS } from "./reporters.js";

const APPVIEW = "https://public.api.bsky.app/xrpc";

// Helpers
const u = (p, q) => APPVIEW + p + "?" + new URLSearchParams(q).toString();
const uniqBy = (arr, key) => [...new Map(arr.map(o => [key(o), o])).values()];
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

function normalize(view) {
  const v = view.post ? view.post : view;
  const uri = v?.uri || "";
  const rkey = uri.split("/").pop();
  const authorHandle = v?.author?.handle || "";
  const createdAt =
    v?.record?.createdAt ||
    v?.indexedAt ||
    v?.post?.record?.createdAt ||
    v?.post?.indexedAt;
  const text = v?.record?.text || "";

  const url =
    authorHandle && rkey
      ? `https://bsky.app/profile/${authorHandle}/post/${rkey}`
      : null;

  return { uri, url, createdAt, text, authorHandle };
}

function matchText(txt, terms) {
  const s = (txt || "").toLowerCase();
  return terms.some((t) => s.includes(t));
}

async function searchByTermAndAuthor(term, handle, limit = 25) {
  const sp = u("/app.bsky.feed.searchPosts", {
    q: term,
    author: handle,
    limit: String(limit),
    sort: "latest",
  });

  const res = await fetch(sp);
  if (res.ok) {
    const j = await res.json();
    return (j.posts || []).map(normalize);
  }

  // fallback
  const gf = u("/app.bsky.feed.getAuthorFeed", { actor: handle, limit: "50" });
  const r2 = await fetch(gf);
  if (!r2.ok) return [];
  const j2 = await r2.json();
  return (j2.feed || []).map(normalize);
}

export default async function handler(req) {
  // Fix: use absolute base URL for Edge runtime
  const { searchParams } = new URL(req.url, "http://localhost");

  const rawQueries = (searchParams.get("queries") || "").trim();
  const reporters = (searchParams.get("reporters") || "").trim();
  const days = parseInt(searchParams.get("days") || "7", 10);

  if (!rawQueries) {
    return new Response(JSON.stringify({ error: "Missing ?queries=" }), {
      status: 400,
    });
  }

  const terms = rawQueries
    .split("|")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const since = daysAgo(isNaN(days) ? 7 : days);

  const handles = reporters
    ? reporters.split(",").map((s) => s.trim())
    : REPORTERS;

  let out = [];
  for (const handle of handles) {
    for (const term of terms) {
      try {
        const views = await searchByTermAndAuthor(term, handle);
        for (const v of views) out.push(v);
      } catch {
        /* ignore */
      }
    }
  }

  out = out.filter((p) => {
    const t = p.createdAt ? new Date(p.createdAt) : null;
    const inWindow = t ? t >= since : false;
    return p.url && inWindow && matchText(p.text, terms);
  });

  out = uniqBy(out, (p) => p.uri).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  const body = JSON.stringify({
    posts: out.map((p) => ({ url: p.url, createdAt: p.createdAt })),
  });

  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "s-maxage=300, stale-while-revalidate=300",
    },
  });
}
