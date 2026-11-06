import { comparePkValues, isPkComparable } from './pk-utils.js';
import type { PulseEvent } from './pulse-events.js';
import { type MergeEntry, PulseMergeCore, type PulsePk } from './pulse-merge-core.js';

export interface RangedMergeCoreOptions {
  order: 'asc' | 'desc';
  limit: number | null;
  rangeStart: PulsePk | null;
  rangeEnd: PulsePk | null;
}

// HTTP-only variant: adds load-more (appendRows) and the range-window insert gate on top of
// the full-set base. Wire rows carry their identity as `$pk` (the HTTP client doesn't know
// the pk column name), so this class derives the base's out-of-band pk from that property at
// its row-accepting boundaries. The embedded client never constructs this class — embedded's
// import graph must stay lean, enforced by platform-imports.test.ts.
export class RangedPulseMergeCore<
  TRow extends Record<string, unknown> & { $pk: unknown },
> extends PulseMergeCore<TRow> {
  limit: number | null;
  rangeStart: PulsePk | null;
  rangeEnd: PulsePk | null;

  constructor(opts: RangedMergeCoreOptions) {
    super({ order: opts.order });
    this.limit = opts.limit;
    this.rangeStart = opts.rangeStart;
    this.rangeEnd = opts.rangeEnd;
  }

  rebuildFromRows(rows: readonly TRow[]): void {
    this.rebuild(rows.map((row) => ({ pk: row.$pk, row })));
  }

  // Appends load-more rows to the end without re-sorting. Returns true if any row was added.
  appendRows(rows: readonly TRow[]): boolean {
    const toAppend: MergeEntry<TRow>[] = [];
    for (const row of rows) {
      if (!isPkComparable(row.$pk)) continue;
      if (this._pkMap.has(row.$pk)) continue;
      toAppend.push({ pk: row.$pk, row });
    }
    if (toAppend.length === 0) return false;
    for (const entry of toAppend) {
      this._pkMap.set(entry.pk as PulsePk, entry);
    }
    this.commitEntries([...this.entries, ...toAppend]);
    return true;
  }

  override clear(): void {
    super.clear();
    this.rangeStart = null;
    this.rangeEnd = null;
  }

  // Inserts/updates key off the wire row's `$pk`, deletes off `event.pk` — the same sources
  // rebuildFromRows/appendRows and the server's delete events use. `event.pk` is the
  // pre-transform source value, so keying non-delete events off it would desync from the
  // `$pk`-keyed baseline whenever a `.transform()` rewrites the pk, duplicating rows.
  protected override eventPk(event: PulseEvent<TRow>): unknown {
    return event.op === 'delete' ? event.pk : event.row.$pk;
  }

  // Returns true when a new insert should be accepted into the current window.
  // limit === null means no-range mode: every matching insert is accepted.
  protected override acceptInsert(rowPk: PulsePk): boolean {
    if (this.limit === null) return true;
    if (this.rangeStart === null || this.rangeEnd === null) return true;
    if (this.order === 'desc') {
      return comparePkValues(rowPk, this.rangeEnd) > 0;
    }
    return comparePkValues(rowPk, this.rangeStart) < 0;
  }
}
