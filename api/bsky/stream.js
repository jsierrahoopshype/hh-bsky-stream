export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const queries = searchParams.get("queries")?.split("|") || [];
    const days = parseInt(searchParams.get("days") || "7", 10);

    console.log("Incoming request", { queries, days });

    const results = await Promise.all(
      queries.map(async (q) => {
        try {
          const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(
            q
          )}&since=${days}d`;

          console.log("Fetching:", url);

          const res = await fetch(url);
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
