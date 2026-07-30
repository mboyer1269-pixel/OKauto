import { AppError, type Paginated } from "@okauto/shared";

interface CursorPayload {
  createdAt: string;
  id: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  const payload: CursorPayload = { createdAt: createdAt.toISOString(), id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as CursorPayload;
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") throw new Error("bad shape");
    const date = new Date(parsed.createdAt);
    if (Number.isNaN(date.getTime())) throw new Error("bad date");
    return { createdAt: date.toISOString(), id: parsed.id };
  } catch {
    throw AppError.validation("Invalid pagination cursor");
  }
}

/** Keyset WHERE for stable (createdAt DESC, id DESC) ordering. */
export function cursorWhere(cursor?: string):
  | {
      OR: [
        { createdAt: { lt: Date } },
        { createdAt: Date; id: { lt: string } },
      ];
    }
  | Record<string, never> {
  if (!cursor) return {};
  const { createdAt, id } = decodeCursor(cursor);
  const date = new Date(createdAt);
  return {
    OR: [{ createdAt: { lt: date } }, { createdAt: date, id: { lt: id } }],
  };
}

export function toPaginated<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
): Paginated<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}
