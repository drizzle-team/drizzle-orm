import { comparePkValues, isPkComparable } from './pk-utils.js';
import type { PulseEvent } from './pulse-events.js';

export type PulsePk = string | number;
export type MergeEntry<TRow> = { pk: unknown; row: TRow };

export interface MergeCoreOptions {
  order: 'asc' | 'desc';
}

// Full-set merge core: every matching insert is accepted unconditionally (no window/pagination
// gate). This is the variant the embedded client value-imports — the ranged/HTTP-only surface
// (appendRows, the range window gate) lives in RangedPulseMergeCore instead.
export class PulseMergeCore<TRow extends Record<string, unknown>> {
  protected _pkMap = new Map<PulsePk, MergeEntry<TRow>>();
  protected entries: MergeEntry<TRow>[] = [];
  data: TRow[] = [];
  order: 'asc' | 'desc';

  constructor(opts: MergeCoreOptions) {
    this.order = opts.order;
  }

  rebuild(entries: readonly MergeEntry<TRow>[]): void {
    const nextEntries = [...entries];
    const nextPkMap = new Map<PulsePk, MergeEntry<TRow>>();
    for (const entry of nextEntries) {
      if (!isPkComparable(entry.pk)) continue;
      nextPkMap.set(entry.pk, entry);
    }
    this._pkMap = nextPkMap;
    this.commitEntries(nextEntries);
  }

  // Returns true only if at least one event mutated state (no-op-batch guard).
  applyEvents(events: readonly PulseEvent<TRow>[]): boolean {
    if (events.length === 0) return false;
    let updated = [...this.entries];
    let mutated = false;

    for (const event of events) {
      const pk = this.eventPk(event);
      if (!isPkComparable(pk)) continue;

      if (event.op === 'insert') {
        if (this._pkMap.has(pk)) continue;
        if (!this.acceptInsert(pk)) continue;
        const entry: MergeEntry<TRow> = { pk, row: event.row };
        this._pkMap.set(pk, entry);
        updated = this.insertSorted(updated, entry);
        mutated = true;
        continue;
      }

      if (event.op === 'update') {
        const existing = this._pkMap.get(pk);

        if (existing) {
          const existingIndex = updated.indexOf(existing);
          if (event.matchesNew) {
            const entry: MergeEntry<TRow> = { pk, row: event.row };
            this._pkMap.set(pk, entry);
            updated[existingIndex] = entry;
            mutated = true;
          } else {
            this._pkMap.delete(pk);
            updated.splice(existingIndex, 1);
            mutated = true;
          }
          continue;
        }

        if (event.matchesNew) {
          const entry: MergeEntry<TRow> = { pk, row: event.row };
          this._pkMap.set(pk, entry);
          updated = this.insertSorted(updated, entry);
          mutated = true;
        }
        continue;
      }

      // delete
      const existing = this._pkMap.get(pk);
      if (!existing) continue;
      this._pkMap.delete(pk);
      const existingIndex = updated.indexOf(existing);
      if (existingIndex >= 0) {
        updated.splice(existingIndex, 1);
      }
      mutated = true;
    }

    if (mutated) this.commitEntries(updated);
    return mutated;
  }

  clear(): void {
    this._pkMap = new Map();
    this.commitEntries([]);
  }

  protected commitEntries(entries: MergeEntry<TRow>[]): void {
    this.entries = entries;
    this.data = entries.map((entry) => entry.row);
  }

  private insertSorted(entries: MergeEntry<TRow>[], entry: MergeEntry<TRow>): MergeEntry<TRow>[] {
    const updated = [...entries];
    const entryPk = entry.pk;
    if (!isPkComparable(entryPk)) return updated;

    let low = 0;
    let high = updated.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const midEntry = updated[mid];
      if (!midEntry) break;

      if (!isPkComparable(midEntry.pk)) {
        low = mid + 1;
        continue;
      }

      const comparison = comparePkValues(entryPk, midEntry.pk);
      const goesBefore = this.order === 'desc' ? comparison > 0 : comparison < 0;
      if (goesBefore) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    updated.splice(low, 0, entry);
    return updated;
  }

  // Returns true when a new insert should be accepted into the current state. The full-set
  // base always accepts — the ranged/HTTP variant overrides this with a window gate.
  protected acceptInsert(_rowPk: PulsePk): boolean {
    return true;
  }

  // The identity an event addresses state by. The base reads the out-of-band `event.pk`
  // (embedded events always populate it from the source row). The ranged/HTTP variant
  // overrides this to read the wire row's `$pk` instead, because its baseline entries are
  // keyed off `$pk` — which is stamped after a `.transform()` runs, while `event.pk` is the
  // pre-transform source value, and the two must not be mixed within one map.
  protected eventPk(event: PulseEvent<TRow>): unknown {
    return event.pk;
  }
}
