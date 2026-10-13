import { fetchResilient, HttpError, USER_AGENT } from "../util/net";
import { buildMagnet } from "./magnet";
import { unescapeEntities } from "./rss";
import { parseSize, parseUnixSeconds } from "../util/format";
import type { SearchOptions, Source, SourceGroup, SourceId, TorrentResult } from "./types";

const BASE = "https://nyaa.si/";

function tag(item: string, name: string): string {
  return item.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${name}>`, "s"))?.[1]?.trim() ?? "";
}

// Same site, different category scope: `c` is Nyaa's category filter (2_0 audio,
// 3_0 literature, 6_0 software). Each scope is its own source so it can feed a
// different tab.
function makeNyaa(id: SourceId, groups: readonly SourceGroup[], category: string): Source {
  const search = async (query: string, opts: SearchOptions = {}): Promise<TorrentResult[]> => {
    const params = new URLSearchParams({ page: "rss", q: query.trim(), c: category, f: "0" });
    const res = await fetchResilient(`${BASE}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: opts.signal,
    });
    if (!res.ok) throw new HttpError(res.status, `Nyaa returned ${res.status}`);

    const xml = await res.text();
    const out: TorrentResult[] = [];
    for (const item of xml.split("<item>").slice(1)) {
      const infoHash = tag(item, "nyaa:infoHash").toLowerCase();
      const name = unescapeEntities(tag(item, "title"));
      if (!infoHash || !name) continue;
      const seeders = Number(tag(item, "nyaa:seeders"));
      const leechers = Number(tag(item, "nyaa:leechers"));
      const dateStr = tag(item, "pubDate");
      out.push({
        infoHash,
        name,
        sizeBytes: parseSize(tag(item, "nyaa:size")),
        seeders: Number.isFinite(seeders) ? seeders : 0,
        leechers: Number.isFinite(leechers) ? leechers : 0,
        source: id,
        magnet: buildMagnet(infoHash, name),
        added: parseUnixSeconds(dateStr),
      });
    }
    return out;
  };

  return { id, label: "Nyaa", groups, homepage: "https://nyaa.si", reportsHealth: true, search };
}

export const nyaa = makeNyaa("nyaa", ["Anime"], "0_0");
export const nyaaAudio = makeNyaa("nyaa-audio", ["Music"], "2_0");
export const nyaaSoftware = makeNyaa("nyaa-software", ["Software"], "6_0");
