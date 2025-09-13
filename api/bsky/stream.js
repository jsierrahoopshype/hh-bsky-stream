export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    // Build a full URL, using a fallback host if missing
    const url = new URL(req.url, "http://localhost");
    const queries = url.searchParams.get("queries")?.split("|") || [];
    const days = parseInt(url.searchParams.get("days") || "7", 10);

    console.log("Incoming request", { queries, days });

    const results = await Promise.all(
      queries.map(async (q) => {
        try {
          const apiUrl = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(
            q
          )}&since=${days}d`;

          console.log("Fetching:", apiUrl);

          const res = await fetch(apiUrl);
          if (!res.ok) {
            console.error("Failed fetch:", q, res.status);
            return { query: q, error: `Failed with ${res.status}` };
          }

          const data = await res.json();
          console.log("Fetched posts:", q, data.posts?.length || 0);

          return { query: q, posts: data.posts || [] };
        } catch (err) {
          console.error("Error fetching:", q, err);
          return { query: q, error: err.message };
        }
      })
    );

    return new Response(JSON.stringify(results, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Handler error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
