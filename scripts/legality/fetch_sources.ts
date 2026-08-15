/**
 * Build-time fetchers for the legality ETL. Everything is cached under
 * cache/ keyed by request identity, so re-runs are offline unless --refresh.
 * One attempt per request, 9s AbortController timeout, no retries — a failed
 * fetch aborts the ETL rather than emitting a partial artifact.
 */

const CACHE_DIR = new URL("./cache/", import.meta.url).pathname;

// nyc.gov returns 403 to non-browser user agents; this is a plain, honest
// browser UA used only to retrieve a public document.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const PDF_URL =
  "https://www.nyc.gov/assets/doh/downloads/pdf/permit/mfv_restricted_streets.pdf";
export const CSCL_DATASET_ID = "inkn-q76z";
export const BOROUGHS_DATASET_ID = "gthc-hcne";

const FETCH_TIMEOUT_MS = 9000;

async function fetchOnce(url: string, headers: Record<string, string> = {}): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const token = Deno.env.get("NYC_OPEN_DATA_APP_TOKEN");
    const isSocrata = url.includes("data.cityofnewyork.us");
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        ...headers,
        ...(isSocrata && token ? { "X-App-Token": token } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`fetch failed ${response.status} for ${url}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function cached(
  cacheName: string,
  url: string,
  headers: Record<string, string> = {},
  refresh = false,
): Promise<Uint8Array> {
  const path = CACHE_DIR + cacheName;
  if (!refresh) {
    try {
      return Deno.readFileSync(path);
    } catch {
      // cache miss — fall through to fetch
    }
  }
  const bytes = await fetchOnce(url, headers);
  await Deno.mkdir(path.substring(0, path.lastIndexOf("/")), { recursive: true });
  Deno.writeFileSync(path, bytes);
  return bytes;
}

export async function fetchPdf(refresh = false): Promise<Uint8Array> {
  return await cached("mfv_restricted_streets.pdf", PDF_URL, { "User-Agent": BROWSER_UA }, refresh);
}

export type CsclSegment = {
  physicalid: string;
  stname_label: string;
  boroughcode: string;
  rw_type: string;
  the_geom?: { type: "MultiLineString"; coordinates: [number, number][][] };
};

/** Fetch all CSCL centerline rows for one street label in one borough. */
export async function fetchCsclStreet(
  boroughCode: number,
  label: string,
  refresh = false,
): Promise<CsclSegment[]> {
  const params = new URLSearchParams({
    $select: "physicalid,stname_label,boroughcode,rw_type,the_geom",
    $where: `boroughcode='${boroughCode}' AND stname_label='${label.replaceAll("'", "''")}'`,
    $limit: "3000",
  });
  const url = `https://data.cityofnewyork.us/resource/${CSCL_DATASET_ID}.json?${params}`;
  const cacheName = `cscl/${boroughCode}_${label.replaceAll(/[^A-Z0-9]+/g, "_")}.json`;
  const bytes = await cached(cacheName, url, {}, refresh);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Borough boundary polygons for the offline basemap floor. */
export async function fetchBoroughOutlines(refresh = false): Promise<unknown> {
  const url = `https://data.cityofnewyork.us/api/views/${BOROUGHS_DATASET_ID}/rows.geojson`;
  const bytes = await cached("borough_outlines.geojson", url, {}, refresh);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
