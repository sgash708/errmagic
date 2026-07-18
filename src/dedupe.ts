/**
 * 時間窓デデュープ。同一キーは windowMs 内では再報告させない。
 */
export class Deduper {
  private readonly windowMs: number;
  private readonly lastSeenAt = new Map<string, number>();

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  shouldReport(key: string, now: number = Date.now()): boolean {
    const last = this.lastSeenAt.get(key);
    if (last !== undefined && now - last < this.windowMs) {
      return false;
    }
    this.lastSeenAt.set(key, now);
    return true;
  }
}
