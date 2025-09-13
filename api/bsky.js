export default async function handler(req, res) {
  // Parse query parameters from URL
  const myUrl = new URL(req.url, 'http://localhost');
  const queriesParam = myUrl.searchParams.get('queries') || '';
  const daysParam = myUrl.searchParams.get('days') || '7';
  const queries = queriesParam.split('|').filter(Boolean);
  const days = parseInt(daysParam, 10);

  const token = process.env.BLUESKY_TOKEN;

  const results = await Promise.all(
    queries.map(async (q) => {
      const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&since=${days}d`;
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          return { query: q, error: `Failed with ${response.status}` };
        }
        const data = await response.json();
        return { query: q, posts: data.posts || [] };
      } catch (err) {
        return { query: q, error: err.message };
      }
    })
  );

  res.status(200).json(results);
}
