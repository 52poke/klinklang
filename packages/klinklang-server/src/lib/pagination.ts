export const DEFAULT_PAGE_LIMIT = 20
export const MAX_PAGE_LIMIT = 200

interface PaginationInput {
  offset?: string
  limit?: string
}

export interface Pagination {
  offset: number
  limit: number
}

const parseInteger = (value: string | undefined): number | null => {
  if (value === undefined || !/^\d+$/v.test(value)) {
    return null
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function parsePagination ({ offset, limit }: PaginationInput): Pagination {
  const parsedOffset = parseInteger(offset)
  const parsedLimit = parseInteger(limit)
  return {
    offset: parsedOffset ?? 0,
    limit: Math.min(Math.max(parsedLimit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT)
  }
}
