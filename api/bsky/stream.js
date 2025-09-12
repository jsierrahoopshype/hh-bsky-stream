// /api/bsky/stream.js
// Minimal Bluesky stream endpoint for Vercel /api routes
// Example: /api/bsky/stream?queries=Luka|Doncic&days=7

export const config = { runtime: "edge" };

import { REPORTERS } from "./reporters.js";

const APPVIEW = "https://public.api.bsky.app/xrpc";

// Small utils
const qs = (p, q) => APPVIEW + p + "?" + new URLSearchParams(q).toString();
const uniqBy = (arr, key) => [...new Map(arr.map((o) => [key(o), o])).values()];
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

function normalize(view) {
  const v = view?.post ? view.post : view;
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

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

async function searchByTermAndAuthor(term, handle, limit = 25) {
  const sp = qs("/app.bsky.feed.searchPosts", {
    q: term,
    author: handle,
    limit: String(limit),
    sort: "latest",
  });
  const j = await fetchJSON(sp);
  if (j && j.posts) {
    return j.posts.map(normalize);
  }
  // fallback: author feed
  const gf = qs("/app.bsky.feed.getAuthorFeed", { actor: handle, limit: "50" });
  const j2 = await fetchJSON(gf);
  if (j2 && j2.feed) return j2.feed.map(normalize);
  return [];
}

export default async function handler(req) {
  let url;
  try {
    url = new URL(req.url);
  } catch {
    url = new URL(req.url, "http://localhost");
  }
  const params = url.searchParams;
  const rawQueries = (params.get("queries") || "").trim();
  const reporters = (params.get("reporters") || "").trim();
  const days = parseInt(params.get("days") || "7", 10);
  if (!rawQueries) {
    return new Response(JSON.stringify({ error: "Missing ?queries=" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  const terms = rawQueries
    .split("|")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const since = daysAgo(isNaN(days) ? 7 : days);
  const handles = reporters
    ? reporters.split(",").map((s) => s.trim()).filter(Boolean)
    : REPORTERS;
  let out = [];
  for (const handle of handles) {
    for (const term of terms) {
      try {
        const posts = await searchByTermAndAuthor(term, handle);
        out.push(...posts);
      } catch {}
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
