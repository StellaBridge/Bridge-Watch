import { DEFAULT_PAGE_LIMIT, MAXIMUM_PAGE_LIMIT } from "./pagination.constants";

export { DEFAULT_PAGE_LIMIT, MAXIMUM_PAGE_LIMIT };

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PageResult<T> {
  data: T[];
  meta: PageMeta;
  links?: Record<string, string | null>;
}

export type PageFetcherRawResponse<T> =
  | PageResult<T>
  | { data: T[]; total?: number; meta?: Partial<PageMeta>; links?: Record<string, string | null> }
  | { items: T[]; total?: number; meta?: Partial<PageMeta>; links?: Record<string, string | null> }
  | T[];

export type PageFetcher<T, P extends PaginationParams = PaginationParams> = (
  params: P
) => Promise<PageFetcherRawResponse<T>>;

export type PaginationOptions<P extends PaginationParams = PaginationParams> = P & {
  maxPages?: number;
  maxItems?: number;
};

/**
 * Normalizes user-supplied pagination parameters against SDK contracts.
 */
export function normalizePaginationParams(params?: PaginationParams): {
  page: number;
  limit: number;
  offset: number;
} {
  const rawLimit = params?.limit;
  let limit = typeof rawLimit === "number" && !Number.isNaN(rawLimit) ? Math.floor(rawLimit) : DEFAULT_PAGE_LIMIT;
  if (limit < 1) limit = DEFAULT_PAGE_LIMIT;
  if (limit > MAXIMUM_PAGE_LIMIT) limit = MAXIMUM_PAGE_LIMIT;

  let page = 1;
  let offset = 0;

  if (typeof params?.offset === "number" && !Number.isNaN(params.offset) && params.offset >= 0 && params?.page === undefined) {
    offset = Math.floor(params.offset);
    page = Math.floor(offset / limit) + 1;
  } else {
    const rawPage = params?.page;
    page = typeof rawPage === "number" && !Number.isNaN(rawPage) ? Math.floor(rawPage) : 1;
    if (page < 1) page = 1;
    offset = typeof params?.offset === "number" && !Number.isNaN(params.offset) && params.offset >= 0
      ? Math.floor(params.offset)
      : (page - 1) * limit;
  }

  return { page, limit, offset };
}

/**
 * Fetches a single page of items using the provided page fetcher function.
 */
export async function fetchPage<T, P extends PaginationParams = PaginationParams>(
  fetcher: PageFetcher<T, P>,
  params?: P
): Promise<PageResult<T>> {
  const normalized = normalizePaginationParams(params);
  const fullParams = {
    ...(params ?? {}),
    page: normalized.page,
    limit: normalized.limit,
    offset: normalized.offset,
  } as P;

  const raw = await fetcher(fullParams);

  if (Array.isArray(raw)) {
    const total = raw.length;
    const totalPages = Math.ceil(total / normalized.limit) || 1;
    return {
      data: raw,
      meta: {
        total,
        page: normalized.page,
        limit: normalized.limit,
        totalPages,
        hasNext: raw.length === normalized.limit,
        hasPrev: normalized.page > 1,
      },
    };
  }

  const rawObj = raw as {
    data?: T[];
    items?: T[];
    total?: number;
    meta?: Partial<PageMeta>;
    links?: Record<string, string | null>;
  };

  const data: T[] = Array.isArray(rawObj.data)
    ? rawObj.data
    : Array.isArray(rawObj.items)
    ? rawObj.items
    : [];

  const providedMeta = rawObj.meta;
  const providedTotal = typeof rawObj.total === "number" ? rawObj.total : providedMeta?.total;

  const total = typeof providedTotal === "number" ? Math.max(0, providedTotal) : data.length;
  const totalPages = providedMeta?.totalPages ?? (typeof providedTotal === "number" ? Math.ceil(total / normalized.limit) : Math.ceil(data.length / normalized.limit) || 1);

  const hasNext = providedMeta?.hasNext ?? (typeof providedTotal === "number" ? normalized.page < totalPages : data.length === normalized.limit);
  const hasPrev = providedMeta?.hasPrev ?? normalized.page > 1;

  return {
    data,
    meta: {
      total,
      page: normalized.page,
      limit: normalized.limit,
      totalPages,
      hasNext,
      hasPrev,
    },
    links: rawObj.links,
  };
}

/**
 * Returns an AsyncIterable that yields pages of items sequentially.
 */
export async function* iteratePages<T, P extends PaginationParams = PaginationParams>(
  fetcher: PageFetcher<T, P>,
  options?: PaginationOptions<P>
): AsyncIterable<PageResult<T>> {
  let currentPage = options?.page ?? 1;
  let pagesFetched = 0;
  const maxPages = options?.maxPages;

  while (true) {
    if (maxPages !== undefined && pagesFetched >= maxPages) {
      break;
    }

    const currentOptions = {
      ...(options ?? {}),
      page: currentPage,
    } as P;

    const pageResult = await fetchPage(fetcher, currentOptions);
    yield pageResult;
    pagesFetched++;

    if (!pageResult.meta.hasNext || pageResult.data.length === 0) {
      break;
    }

    currentPage++;
  }
}

/**
 * Returns an AsyncIterable that yields individual items item-by-item across pages.
 */
export async function* iterateItems<T, P extends PaginationParams = PaginationParams>(
  fetcher: PageFetcher<T, P>,
  options?: PaginationOptions<P>
): AsyncIterable<T> {
  let itemsYielded = 0;
  const maxItems = options?.maxItems;

  for await (const pageResult of iteratePages(fetcher, options)) {
    for (const item of pageResult.data) {
      if (maxItems !== undefined && itemsYielded >= maxItems) {
        return;
      }
      yield item;
      itemsYielded++;
    }
  }
}

/**
 * Collects all items across pages into a single array.
 */
export async function collectAllPages<T, P extends PaginationParams = PaginationParams>(
  fetcher: PageFetcher<T, P>,
  options?: PaginationOptions<P>
): Promise<T[]> {
  const results: T[] = [];
  for await (const item of iterateItems(fetcher, options)) {
    results.push(item);
  }
  return results;
}
