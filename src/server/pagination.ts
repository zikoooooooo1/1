import type { Request } from 'express';
import type { Store, Param } from './db.js';
export function paginate(
  db: Store,
  req: Request,
  sql: string,
  params: Param[] = [],
  defaultLimit = 25,
) {
  const integer = (value: unknown, fallback: number, max: number) => {
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? Math.min(n, max) : fallback;
  };
  const page = integer(req.query.page, 1, 1000000),
    limit = integer(req.query.limit, defaultLimit, 100);
  const total = db.get(`SELECT count(*) total FROM (${sql})`, ...params)!.total;
  return {
    items: db.all(`${sql} LIMIT ? OFFSET ?`, ...params, limit, (page - 1) * limit),
    total,
    page,
    limit,
  };
}
