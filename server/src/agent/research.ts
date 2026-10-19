import { config } from "../config.js";
import { log } from "../logger.js";
import { withTimeout } from "../util/retry.js";
import { scrub, scrubMany, type Scrubbed } from "./firewall.js";

/**
 * Reading the outside world. Every provider is optional: without a key the
 * tool reports that it is unavailable instead of inventing an answer.
 * Everything that comes back goes through the firewall before the model sees it.
 */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export const searchAvailable = () => config.SEARCH_PROVIDER !== "none" && Boolean(config.SEARCH_API_KEY);
export const xAvailable = () => Boolean(config.X_BEARER_TOKEN);

export async function webSearch(q: string, limit = 5): Promise<{ hits: SearchHit[]; scrubbed: Scrubbed }> {
  if (!searchAvailable()) {
    return { hits: [], scrubbed: scrub("Web search is not configured on this deployment.", "search") };
  }
  const hits = await runSearch(q, limit).catch((err) => {
    log.warn({ err, q }, "search failed");
    return [] as SearchHit[];
  });
  const scrubbed = scrubMany(
    hits.map((h) => `${h.title}\n${h.url}\n${h.snippet}`),
    "search",
  );
  return { hits, scrubbed };
}

async function runSearch(q: string, limit: number): Promise<SearchHit[]> {
  const key = config.SEARCH_API_KEY!;
  switch (config.SEARCH_PROVIDER) {
    case "brave": {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${limit}`;
      const res = await withTimeout(() => fetch(url, { headers: { "X-Subscription-Token": key, accept: "application/json" } }), 15_000, "brave");
      if (!res.ok) throw new Error(`brave ${res.status}`);
      const json = (await res.json()) as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
      return (json.web?.results ?? []).slice(0, limit).map((r) => ({ title: r.title, url: r.url, snippet: r.description }));
    }
    case "tavily": {
      const res = await withTimeout(
        () =>
          fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ api_key: key, query: q, max_results: limit }),
          }),
        15_000,
        "tavily",
      );
      if (!res.ok) throw new Error(`tavily ${res.status}`);
      const json = (await res.json()) as { results?: Array<{ title: string; url: string; content: string }> };
      return (json.results ?? []).slice(0, limit).map((r) => ({ title: r.title, url: r.url, snippet: r.content }));
    }
    case "exa": {
      const res = await withTimeout(
        () =>
          fetch("https://api.exa.ai/search", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key },
            body: JSON.stringify({ query: q, numResults: limit, contents: { text: { maxCharacters: 600 } } }),
          }),
        15_000,
        "exa",
      );
      if (!res.ok) throw new Error(`exa ${res.status}`);
      const json = (await res.json()) as { results?: Array<{ title: string; url: string; text?: string }> };
      return (json.results ?? []).slice(0, limit).map((r) => ({ title: r.title, url: r.url, snippet: r.text ?? "" }));
    }
    default:
      return [];
  }
}

/** Recent posts for a handle, read-only, firewalled. */
export async function readX(handle: string, limit = 10): Promise<{ posts: string[]; scrubbed: Scrubbed }> {
  if (!xAvailable()) {
    return { posts: [], scrubbed: scrub("Reading X is not configured on this deployment.", "x_post") };
  }
  const clean = handle.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15);
  if (!clean) return { posts: [], scrubbed: scrub("No such handle.", "x_post") };
  try {
    const userRes = await withTimeout(
      () => fetch(`https://api.x.com/2/users/by/username/${clean}`, { headers: { authorization: `Bearer ${config.X_BEARER_TOKEN}` } }),
      15_000,
      "x user",
    );
    if (!userRes.ok) throw new Error(`x users ${userRes.status}`);
    const user = (await userRes.json()) as { data?: { id?: string } };
    if (!user.data?.id) return { posts: [], scrubbed: scrub("No such handle.", "x_post") };

    const res = await withTimeout(
      () =>
        fetch(`https://api.x.com/2/users/${user.data!.id}/tweets?max_results=${Math.min(limit, 100)}&tweet.fields=created_at`, {
          headers: { authorization: `Bearer ${config.X_BEARER_TOKEN}` },
        }),
      15_000,
      "x timeline",
    );
    if (!res.ok) throw new Error(`x tweets ${res.status}`);
    const json = (await res.json()) as { data?: Array<{ text: string }> };
    const posts = (json.data ?? []).map((t) => t.text);
    return { posts, scrubbed: scrubMany(posts, "x_post") };
  } catch (err) {
    log.warn({ err, handle }, "reading X failed");
    return { posts: [], scrubbed: scrub("Could not read X right now.", "x_post") };
  }
}
