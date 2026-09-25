import { describe, it, expect, vi } from "vitest";
import {
  normalizePaginationParams,
  fetchPage,
  iteratePages,
  iterateItems,
  collectAllPages,
  DEFAULT_PAGE_LIMIT,
  MAXIMUM_PAGE_LIMIT,
} from "./pagination";
import type { PageFetcher } from "./pagination";

describe("SDK Pagination Helpers", () => {
  describe("normalizePaginationParams", () => {
    it("should return default parameters when none provided", () => {
      const result = normalizePaginationParams();
      expect(result).toEqual({ page: 1, limit: DEFAULT_PAGE_LIMIT, offset: 0 });
    });

    it("should correctly compute offset from page and limit", () => {
      const result = normalizePaginationParams({ page: 3, limit: 15 });
      expect(result).toEqual({ page: 3, limit: 15, offset: 30 });
    });

    it("should clamp limit to MAXIMUM_PAGE_LIMIT when limit exceeds maximum", () => {
      const result = normalizePaginationParams({ limit: 500 });
      expect(result.limit).toBe(MAXIMUM_PAGE_LIMIT);
    });

    it("should fallback to DEFAULT_PAGE_LIMIT when limit is less than 1 or invalid", () => {
      expect(normalizePaginationParams({ limit: 0 }).limit).toBe(DEFAULT_PAGE_LIMIT);
      expect(normalizePaginationParams({ limit: -5 }).limit).toBe(DEFAULT_PAGE_LIMIT);
      expect(normalizePaginationParams({ limit: NaN }).limit).toBe(DEFAULT_PAGE_LIMIT);
    });

    it("should derive page from offset when page is not provided", () => {
      const result = normalizePaginationParams({ offset: 40, limit: 20 });
      expect(result).toEqual({ page: 3, limit: 20, offset: 40 });
    });

    it("should default page to 1 if negative or invalid", () => {
      expect(normalizePaginationParams({ page: -1 }).page).toBe(1);
      expect(normalizePaginationParams({ page: NaN }).page).toBe(1);
    });
  });

  describe("fetchPage", () => {
    it("should fetch a page with object wrapper response format", async () => {
      const mockItems = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
      const fetcher: PageFetcher<{ id: number }> = vi.fn().mockResolvedValue({
        data: mockItems,
        total: 25,
      });

      const result = await fetchPage(fetcher, { page: 1, limit: 10 });

      expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10, offset: 0 }));
      expect(result.data).toHaveLength(10);
      expect(result.meta).toEqual({
        total: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
        hasNext: true,
        hasPrev: false,
      });
    });

    it("should handle response with `items` key instead of `data`", async () => {
      const fetcher: PageFetcher<{ id: number }> = vi.fn().mockResolvedValue({
        items: [{ id: 100 }, { id: 101 }],
        total: 2,
      });

      const result = await fetchPage(fetcher, { page: 1 });

      expect(result.data).toEqual([{ id: 100 }, { id: 101 }]);
      expect(result.meta.total).toBe(2);
      expect(result.meta.hasNext).toBe(false);
    });

    it("should handle raw array response format", async () => {
      const rawData = [{ id: 1 }, { id: 2 }];
      const fetcher: PageFetcher<{ id: number }> = vi.fn().mockResolvedValue(rawData);

      const result = await fetchPage(fetcher, { page: 1, limit: 20 });

      expect(result.data).toEqual(rawData);
      expect(result.meta.total).toBe(2);
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(false);
    });

    it("should preserve custom filter parameters passed to fetcher", async () => {
      const fetcher = vi.fn().mockResolvedValue({ data: [], total: 0 });

      await fetchPage(fetcher, { page: 2, limit: 10, search: "stellar", status: "active" } as any);

      expect(fetcher).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        offset: 10,
        search: "stellar",
        status: "active",
      });
    });
  });

  describe("iteratePages", () => {
    it("should iterate through all pages until hasNext is false", async () => {
      const fetcher: PageFetcher<number> = vi.fn().mockImplementation(async (params) => {
        const page = params.page ?? 1;
        if (page === 1) return { data: [1, 2, 3], total: 7 };
        if (page === 2) return { data: [4, 5, 6], total: 7 };
        return { data: [7], total: 7 };
      });

      const pages = [];
      for await (const pageResult of iteratePages(fetcher, { limit: 3 })) {
        pages.push(pageResult);
      }

      expect(pages).toHaveLength(3);
      expect(pages[0].data).toEqual([1, 2, 3]);
      expect(pages[1].data).toEqual([4, 5, 6]);
      expect(pages[2].data).toEqual([7]);
      expect(fetcher).toHaveBeenCalledTimes(3);
    });

    it("should respect maxPages option", async () => {
      const fetcher: PageFetcher<number> = vi.fn().mockImplementation(async (params) => {
        const page = params.page ?? 1;
        return { data: [page * 10], total: 100 };
      });

      const pages = [];
      for await (const pageResult of iteratePages(fetcher, { maxPages: 2 })) {
        pages.push(pageResult);
      }

      expect(pages).toHaveLength(2);
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe("iterateItems", () => {
    it("should yield individual items item-by-item across pages", async () => {
      const fetcher: PageFetcher<string> = vi.fn().mockImplementation(async (params) => {
        const page = params.page ?? 1;
        if (page === 1) return { data: ["a", "b"], total: 3 };
        return { data: ["c"], total: 3 };
      });

      const items: string[] = [];
      for await (const item of iterateItems(fetcher, { limit: 2 })) {
        items.push(item);
      }

      expect(items).toEqual(["a", "b", "c"]);
    });

    it("should stop yielding items when maxItems is reached mid-page", async () => {
      const fetcher: PageFetcher<number> = vi.fn().mockResolvedValue({
        data: [10, 20, 30, 40, 50],
        total: 100,
      });

      const items: number[] = [];
      for await (const item of iterateItems(fetcher, { maxItems: 3 })) {
        items.push(item);
      }

      expect(items).toEqual([10, 20, 30]);
    });
  });

  describe("collectAllPages", () => {
    it("should collect all items across all pages into a single array", async () => {
      const fetcher: PageFetcher<number> = vi.fn().mockImplementation(async (params) => {
        const page = params.page ?? 1;
        if (page === 1) return { data: [1, 2], total: 4 };
        return { data: [3, 4], total: 4 };
      });

      const result = await collectAllPages(fetcher, { limit: 2 });
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it("should propagate errors from fetcher gracefully", async () => {
      const fetcher: PageFetcher<number> = vi.fn().mockRejectedValue(new Error("API network error"));

      await expect(collectAllPages(fetcher)).rejects.toThrow("API network error");
    });
  });
});
