import { describe, it, expect, vi, beforeEach } from "vitest";
import { tpbBooks, tpbGames, tpbMovies, tpbMusic, tpbSoftware } from "./piratebay";
import { fetchResilient } from "../util/net";

vi.mock("../util/net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../util/net")>();
  return { ...actual, fetchResilient: vi.fn() };
});

const mockFetch = vi.mocked(fetchResilient);

const page = (items: unknown[]): Response =>
  ({ ok: true, status: 200, json: async () => items }) as unknown as Response;

// apibay answers an empty search with this single placeholder instead of [].
const SENTINEL = {
  id: "0",
  name: "No results returned",
  info_hash: "0000000000000000000000000000000000000000",
  category: "0",
};

const movieRow = {
  id: "1",
  name: "Dune Part Two 2024 1080p",
  info_hash: "a".repeat(40),
  seeders: "12",
  leechers: "3",
  size: "4000",
  num_files: "2",
  added: "1700000000",
  category: "207",
};

const askedUrl = (call: number): string => String(mockFetch.mock.calls[call]![0]);

beforeEach(() => {
  mockFetch.mockReset();
});

// apibay caches search results per exact URL, and a query can be stuck with
// the sentinel on one URL form while the alternate form answers fine (live:
// q=metallica is poisoned bare but healthy with &cat=0; q=dune the other way
// around). One retry on the other form re-rolls that cache key instead of
// showing the user an empty column.
describe("apibay sentinel retry", () => {
  it("retries with cat=0 when a search comes back as the no-results sentinel", async () => {
    mockFetch.mockResolvedValueOnce(page([SENTINEL]));
    mockFetch.mockResolvedValueOnce(page([movieRow]));
    const results = await tpbMovies.search("metallica");
    expect(results.map((r) => r.name)).toEqual([movieRow.name]);
    expect(askedUrl(0)).toBe("https://apibay.org/q.php?q=metallica");
    expect(askedUrl(1)).toBe("https://apibay.org/q.php?q=metallica&cat=0");
  });

  it("asks once when the search returns real rows", async () => {
    mockFetch.mockResolvedValueOnce(page([movieRow]));
    await tpbMovies.search("dune");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns empty when both forms answer with the sentinel", async () => {
    mockFetch.mockResolvedValueOnce(page([SENTINEL]));
    mockFetch.mockResolvedValueOnce(page([SENTINEL]));
    expect(await tpbMovies.search("qqqqzzzz")).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("never retries a browse, which hits the precompiled feed", async () => {
    mockFetch.mockResolvedValueOnce(page([movieRow]));
    await tpbMovies.search("");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(askedUrl(0)).toContain("/precompiled/");
  });
});


describe("TPB category sources", () => {
  it("scopes each source to its category group", () => {
    expect(tpbMusic.groups).toEqual(["Music"]);
    expect(tpbBooks.groups).toEqual(["Books"]);
    expect(tpbSoftware.groups).toEqual(["Software"]);
    expect(tpbGames.groups).toEqual(["Games"]);
  });

  it("keeps only rows in the source's category set when searching", async () => {
    const musicRow = { ...movieRow, id: "2", info_hash: "b".repeat(40), name: "Album", category: "101" };
    const softwareRow = { ...movieRow, id: "3", info_hash: "c".repeat(40), name: "App", category: "301" };
    mockFetch.mockResolvedValueOnce(page([movieRow, musicRow, softwareRow]));
    const results = await tpbMusic.search("test");
    expect(results.map((r) => r.name)).toEqual([musicRow.name]);
  });

  it("browses the precompiled feed scoped to the source's category", async () => {
    mockFetch.mockResolvedValueOnce(page([movieRow]));
    await tpbBooks.search("");
    expect(askedUrl(0)).toBe("https://apibay.org/precompiled/data_top100_601.json");
  });
});