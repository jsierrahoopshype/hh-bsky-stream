export default async function handler(req, res) {
  try {
    const myUrl = new URL(req.url, "http://localhost");
    const queries = (myUrl.searchParams.get("queries") || "").split("|").filter(Boolean);
    const days = parseInt(myUrl.searchParams.get("days") || "7", 10);

    const token = process.env.BLUESKY_TOKEN;

    const results = await Promise.all(
      queries.map(async (q) => {
        const apiUrl = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(
          q
        )}&since=${days}d`;

        try {
          const resApi = await fetch(apiUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!resApi.ok) {
            return { query: q, error: `Failed with ${resApi.status}` };
          }
          const data = await resApi.json();
          return { query: q, posts: data.posts || [] };
        } catch (err) {
          return { query: q, error: err.message };
        }
      })
    );

    res.status(200).json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
Switch to Node handler
