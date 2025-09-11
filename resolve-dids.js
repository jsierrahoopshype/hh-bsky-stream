// resolve-dids.js
// Run this once to update reporters.json with real DIDs

import fs from "fs";
import fetch from "node-fetch";

const APPVIEW = "https://public.api.bsky.app/xrpc";

function u(p, q) {
  return APPVIEW + p + "?" + new URLSearchParams(q).toString();
}

async function resolveHandle(handle) {
  const url = u("/com.atproto.identity.resolveHandle", { handle });
  const r = await fetch(url);
  if (!r.ok) {
    console.error("❌ Failed:", handle);
    return null;
  }
  const j = await r.json();
  return j.did;
}

async function main() {
  const reporters = JSON.parse(fs.readFileSync("reporters.json", "utf8"));

  for (let r of reporters) {
    if (!r.did || r.did === "did:plc:TO_RESOLVE") {
      const did = await resolveHandle(r.handle);
      if (did) {
        console.log("✅", r.handle, "→", did);
        r.did = did;
      }
    }
  }

  fs.writeFileSync("reporters.json", JSON.stringify(reporters, null, 2));
  console.log("🎉 reporters.json updated with real DIDs!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
