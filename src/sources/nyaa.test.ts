import { describe, it, expect, vi, beforeEach } from "vitest";
import { nyaa, nyaaAudio, nyaaSoftware } from "./nyaa";
import { fetchResilient } from "../util/net";
import type * as netModule from "../util/net";

vi.mock("../util/net", async (importOriginal) => {
  const actual = await importOriginal<typeof netModule>();
  return { ...actual, fetchResilient: vi.fn() };
});

const mockFetch = vi.mocked(fetchResilient);

const rss = (items: string[]): Response =>
  ({ ok: true, status: 200, text: async () => items.join("") }) as unknown as Response;

const item = `<item><title>Album Name</title><nyaa:infoHash>${"a".repeat(40)}</nyaa:infoHash><nyaa:size>1 GiB</nyaa:size><nyaa:seeders>5</nyaa:seeders><nyaa:leechers>1</nyaa:leechers><pubDate>Wed, 01 Jan 2025 00:00:00 +0000</pubDate></item>`;

const askedUrl = (call: number): string => String(mockFetch.mock.calls[call]![0]);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("Nyaa category sources", () => {
  it("scopes each source to its category group", () => {
    expect(nyaa.groups).toEqual(["Anime"]);
    expect(nyaaAudio.groups).toEqual(["Music"]);
    expect(nyaaSoftware.groups).toEqual(["Software"]);
  });

  it("requests Nyaa with the source's category filter", async () => {
    mockFetch.mockResolvedValueOnce(rss([item]));
    await nyaaAudio.search("album");
    expect(askedUrl(0)).toContain("c=2_0");
    expect(askedUrl(0)).toContain("q=album");
  });

  it("uses the software category for the software source", async () => {
    mockFetch.mockResolvedValueOnce(rss([item]));
    await nyaaSoftware.search("app");
    expect(askedUrl(0)).toContain("c=6_0");
  });

  it("maps rows to results tagged with the source id", async () => {
    mockFetch.mockResolvedValueOnce(rss([item]));
    const results = await nyaaAudio.search("album");
    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe("nyaa-audio");
  });
});
