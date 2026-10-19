import { log } from "../logger.js";
import { withTimeout, retry } from "../util/retry.js";

/**
 * Coin metadata. Pump hosts the JSON on IPFS and the mint stores the URI, so
 * this runs once per launch, before the create transaction is built.
 */

const IPFS_URL = process.env.PUMP_IPFS_URL ?? "https://pump.fun/api/ipfs";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export interface MetadataInput {
  name: string;
  symbol: string;
  description: string;
  imageUrl?: string | undefined;
  twitter?: string | undefined;
  telegram?: string | undefined;
  website?: string | undefined;
}

export async function uploadMetadata(input: MetadataInput): Promise<string> {
  const form = new FormData();
  form.set("name", input.name);
  form.set("symbol", input.symbol);
  form.set("description", input.description.slice(0, 1_000));
  form.set("showName", "true");
  if (input.twitter) form.set("twitter", input.twitter);
  if (input.telegram) form.set("telegram", input.telegram);
  if (input.website) form.set("website", input.website);

  if (input.imageUrl) {
    const image = await fetchImage(input.imageUrl);
    if (image) form.set("file", image, "coin.png");
  }

  const res = await retry(
    () => withTimeout(() => fetch(IPFS_URL, { method: "POST", body: form }), 45_000, "ipfs"),
    { label: "ipfs", attempts: 3 },
  );
  if (!res.ok) throw new Error(`metadata upload failed: ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));

  const json = (await res.json()) as { metadataUri?: string; metadata_uri?: string };
  const uri = json.metadataUri ?? json.metadata_uri;
  if (!uri) throw new Error("metadata upload returned no URI");
  log.info({ uri, symbol: input.symbol }, "metadata uploaded");
  return uri;
}

async function fetchImage(url: string): Promise<Blob | null> {
  try {
    // Only http(s), so a launch cannot make the server read its own filesystem
    // or reach something inside the network.
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const res = await withTimeout(() => fetch(url), 20_000, "image");
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      log.warn({ url, bytes: buf.byteLength }, "coin image is too large; launching without it");
      return null;
    }
    return new Blob([buf], { type });
  } catch (err) {
    log.warn({ err, url }, "could not fetch the coin image");
    return null;
  }
}
