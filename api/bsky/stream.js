export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    // Force req.url to be absolute with a base
    const url = new URL(req.url, "http://localhost");
    const queries = url.searchParams.get("queries")?.split("|") || [];
    const days = parseInt(url.searchParams.get("days") || "7", 10);

    const results = await Promise.all(
      queries.map(async (q) => {
        const apiUrl = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(
          q
        )}&since=${days}d`;

        try {
          const res = await fetch(apiUrl, {
            headers: {
              Authorization: `Bearer ${process.env.BLUESKY_TOKEN}`,
            },
          });

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
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
