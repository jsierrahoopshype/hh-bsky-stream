export const config = { runtime: "edge" };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const queries = searchParams.get("queries")?.split("|") || [];
  const days = parseInt(searchParams.get("days") || "7", 10);

  const results = await Promise.all(
    queries.map(async (q) => {
      try {
        const res = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(
            q
          )}&since=${days}d`
        );
        if (!res.ok) {
          return { query: q, error: `Failed with ${res.status}` };
        }
        const data = await res.json();
        return { query: q, posts: data.posts || [] };
      } catch (err) {
        return { query: q, error: err.message };
      }
    })
  );

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
