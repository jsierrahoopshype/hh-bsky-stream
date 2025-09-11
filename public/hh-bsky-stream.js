// Finds <div class="hh-bsky-stream"> blocks on the page,
// asks your endpoint for matching posts, and renders each via Bluesky oEmbed.
(async function () {
  function ready(fn){ (document.readyState !== 'loading') ? fn() : document.addEventListener('DOMContentLoaded', fn); }
  async function fetchJSON(url){ const r=await fetch(url); if(!r.ok) throw new Error("Fetch failed"); return r.json(); }
  async function oembedHTML(url){
    const r = await fetch("https://embed.bsky.app/oembed?url=" + encodeURIComponent(url));
    if(!r.ok) throw new Error("oEmbed failed");
    const j = await r.json();
    return j.html; // contains blockquote + script that swaps to the official iframe
  }

  ready(async () => {
    const blocks = document.querySelectorAll(".hh-bsky-stream");
    for (const el of blocks) {
      const qs = (el.getAttribute("data-queries") || "").trim();
      const days = (el.getAttribute("data-days") || "7").trim();
      const reps = (el.getAttribute("data-reporters") || "").trim();

      if (!qs) { el.textContent = "Missing data-queries"; continue; }

      const base = (new URL(document.currentScript.src)).origin; // YOURDOMAIN
      const api = `${base}/api/bsky/stream?queries=${encodeURIComponent(qs)}&days=${encodeURIComponent(days)}&reporters=${encodeURIComponent(reps)}`;

      // UI shell
      el.innerHTML = '<div class="hh-bsky-list" style="display:grid;gap:12px"></div>';
      const list = el.querySelector(".hh-bsky-list");

      async function load() {
        try {
          const data = await fetchJSON(api);
          list.innerHTML = "";
          for (const p of (data.posts || [])) {
            const html = await oembedHTML(p.url);
            const wrapper = document.createElement("div");
            wrapper.className = "hh-bsky-item";
            wrapper.innerHTML = html;
            list.appendChild(wrapper);
          }
          if (!data.posts || data.posts.length === 0) {
            list.innerHTML = '<div>No recent posts.</div>';
          }
        } catch (e) {
          list.innerHTML = '<div>Stream unavailable.</div>';
        }
      }

      await load();
      // Refresh every 3 minutes
      setInterval(load, 180000);
    }
  });
})();
