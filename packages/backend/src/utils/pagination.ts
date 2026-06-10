export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export function parsePagination(query: { limit?: string; offset?: string }): PaginationParams {
  const limit = Math.min(Math.max(parseInt(query.limit || "50", 10) || 50, 1), 100);
  const offset = Math.max(parseInt(query.offset || "0", 10) || 0, 0);
  return { limit, offset };
}
