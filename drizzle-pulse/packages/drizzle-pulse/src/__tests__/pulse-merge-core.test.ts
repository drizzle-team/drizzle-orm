import { describe, expect, test } from 'bun:test';
import { PulseMergeCore } from '../shared/pulse-merge-core.js';
import { RangedPulseMergeCore } from '../shared/ranged-merge-core.js';

// The full-set base keys rows by out-of-band pks (rebuild entries + event.pk); rows carry no
// identity property.
type BaseRow = {
  id: number;
  label: string;
};

function entries(rows: BaseRow[]) {
  return rows.map((row) => ({ pk: row.id, row }));
}

// The ranged/HTTP variant consumes wire rows, which carry their identity as $pk.
type WireRow = {
  $pk: number;
  label: string;
};

describe('PulseMergeCore (full-set base)', () => {
  describe('full-set inserts', () => {
    test('accepts every insert with a comparable pk', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'asc' });

      const changed = core.applyEvents([{ op: 'insert', row: { id: 999, label: 'big' }, pk: 999 }]);
      expect(changed).toBe(true);
      expect(core.data).toHaveLength(1);
      expect(core.data[0]?.id).toBe(999);
    });

    test('accepts arbitrary pk magnitudes — no window gate', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'asc' });

      core.applyEvents([
        { op: 'insert', row: { id: 100, label: 'hundred' }, pk: 100 },
        { op: 'insert', row: { id: 1, label: 'one' }, pk: 1 },
        { op: 'insert', row: { id: 50, label: 'fifty' }, pk: 50 },
      ]);

      expect(core.data).toHaveLength(3);
    });

    test('maintains asc order for inserts', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'asc' });

      core.applyEvents([
        { op: 'insert', row: { id: 3, label: 'c' }, pk: 3 },
        { op: 'insert', row: { id: 1, label: 'a' }, pk: 1 },
        { op: 'insert', row: { id: 2, label: 'b' }, pk: 2 },
      ]);

      expect(core.data.map((r) => r.id)).toEqual([1, 2, 3]);
    });

    test('maintains desc order for inserts', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'desc' });

      core.applyEvents([
        { op: 'insert', row: { id: 1, label: 'a' }, pk: 1 },
        { op: 'insert', row: { id: 3, label: 'c' }, pk: 3 },
        { op: 'insert', row: { id: 2, label: 'b' }, pk: 2 },
      ]);

      expect(core.data.map((r) => r.id)).toEqual([3, 2, 1]);
    });

    test('a full-set core accepts every matching insert regardless of prior state (no window gate reachable)', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'asc' });
      core.rebuild(entries(Array.from({ length: 50 }, (_, i) => ({ id: i, label: `${i}` }))));

      const changed = core.applyEvents([
        { op: 'insert', row: { id: -1, label: 'below-everything' }, pk: -1 },
        { op: 'insert', row: { id: 1000, label: 'above-everything' }, pk: 1000 },
      ]);

      expect(changed).toBe(true);
      expect(core.data).toHaveLength(52);
      expect(core.data[0]?.id).toBe(-1);
      expect(core.data.at(-1)?.id).toBe(1000);
    });
  });

  describe('no-op-batch guard', () => {
    test('empty batch returns false', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'asc' });

      const changed = core.applyEvents([]);
      expect(changed).toBe(false);
    });

    test('duplicate-insert batch (pk already in pkMap) returns false', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'asc' });
      core.rebuild(entries([{ id: 1, label: 'a' }]));

      const changed = core.applyEvents([{ op: 'insert', row: { id: 1, label: 'a-dup' }, pk: 1 }]);
      expect(changed).toBe(false);
      expect(core.data[0]?.label).toBe('a');
    });

    test('returns true when at least one event mutates state', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'asc' });

      const changed = core.applyEvents([{ op: 'insert', row: { id: 1, label: 'a' }, pk: 1 }]);
      expect(changed).toBe(true);
    });
  });

  describe('merge operations', () => {
    test('insert then update(matchesNew) replaces the row', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'asc' });
      core.applyEvents([{ op: 'insert', row: { id: 1, label: 'a' }, pk: 1 }]);

      const changed = core.applyEvents([
        {
          op: 'update',
          row: { id: 1, label: 'a2' },
          old_row: { id: 1, label: 'a' },
          pk: 1,
          matchesNew: true,
        },
      ]);
      expect(changed).toBe(true);
      expect(core.data).toEqual([{ id: 1, label: 'a2' }]);
    });

    test('update with matchesNew=false for a present pk removes the row', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'asc' });
      core.rebuild(entries([{ id: 1, label: 'a' }]));

      const changed = core.applyEvents([
        {
          op: 'update',
          row: { id: 1, label: 'a-new' },
          old_row: { id: 1, label: 'a' },
          pk: 1,
          matchesNew: false,
        },
      ]);
      expect(changed).toBe(true);
      expect(core.data).toHaveLength(0);
    });

    test('delete for a pk in the map removes the row', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'asc' });
      core.rebuild(entries([{ id: 1, label: 'a' }]));

      const changed = core.applyEvents([{ op: 'delete', old_row: { id: 1, label: 'a' }, pk: 1 }]);
      expect(changed).toBe(true);
      expect(core.data).toHaveLength(0);
      expect(core.data.some((r) => r.id === 1)).toBe(false);
    });

    test('update with matchesNew for absent pk inserts it sorted', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'asc' });
      core.rebuild(
        entries([
          { id: 1, label: 'a' },
          { id: 3, label: 'c' },
        ]),
      );

      core.applyEvents([
        {
          op: 'update',
          row: { id: 2, label: 'b' },
          old_row: { id: 2, label: 'b-old' },
          pk: 2,
          matchesNew: true,
        },
      ]);
      expect(core.data.map((r) => r.id)).toEqual([1, 2, 3]);
    });

    test('delete for pk not in pkMap is a no-op', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'asc' });
      core.rebuild(entries([{ id: 1, label: 'a' }]));

      const changed = core.applyEvents([
        { op: 'delete', old_row: { id: 99, label: 'missing' }, pk: 99 },
      ]);
      expect(changed).toBe(false);
      expect(core.data).toHaveLength(1);
    });
  });

  describe('clear', () => {
    test('resets pkMap and data', () => {
      const core = new PulseMergeCore<BaseRow>({ order: 'asc' });
      core.rebuild(entries([{ id: 1, label: 'a' }]));
      core.clear();

      expect(core.data).toHaveLength(0);
      // pkMap must also be cleared — re-adding the same pk succeeds instead of being deduped
      const changed = core.applyEvents([{ op: 'insert', row: { id: 1, label: 'a2' }, pk: 1 }]);
      expect(changed).toBe(true);
      expect(core.data).toEqual([{ id: 1, label: 'a2' }]);
    });
  });
});

describe('RangedPulseMergeCore', () => {
  describe('range window insert gate', () => {
    test('insert rejected by range window returns false', () => {
      // asc, rangeStart=100 means prepend inserts must have pk < 100
      // pk=200 fails that check → batch is a no-op
      const core = new RangedPulseMergeCore<WireRow>({
        order: 'asc',
        limit: 10,
        rangeStart: 100,
        rangeEnd: 110,
      });

      const changed = core.applyEvents([
        { op: 'insert', row: { $pk: 200, label: 'outside' }, pk: 200 },
      ]);
      expect(changed).toBe(false);
      expect(core.data).toHaveLength(0);
    });

    test('all-rejected batch leaves data unchanged', () => {
      const core = new RangedPulseMergeCore<WireRow>({
        order: 'asc',
        limit: 10,
        rangeStart: 100,
        rangeEnd: 110,
      });
      core.rebuildFromRows([{ $pk: 105, label: 'x' }]);

      const before = core.data;
      const changed = core.applyEvents([
        { op: 'insert', row: { $pk: 200, label: 'outside' }, pk: 200 },
      ]);
      expect(changed).toBe(false);
      expect(core.data).toBe(before);
    });
  });

  describe('event identity comes from the wire row, not event.pk', () => {
    // On the HTTP path `$pk` is stamped after `.transform()` runs while `event.pk` is the
    // pre-transform source value — a pk-rewriting transform makes them diverge, and the
    // baseline map is keyed off `$pk`. Regression pin: events must merge against that key.
    type TransformedRow = { $pk: string | number; label: string };

    test('an update whose event.pk diverges from row.$pk still replaces in place', () => {
      const core = new RangedPulseMergeCore<TransformedRow>({
        order: 'asc',
        limit: null,
        rangeStart: null,
        rangeEnd: null,
      });
      core.rebuildFromRows([{ $pk: '7', label: 'a' }]);

      const changed = core.applyEvents([
        {
          op: 'update',
          row: { $pk: '7', label: 'b' },
          old_row: {},
          pk: 7,
          matchesNew: true,
        },
      ]);
      expect(changed).toBe(true);
      expect(core.data).toEqual([{ $pk: '7', label: 'b' }]);
    });

    test('a replayed insert whose event.pk diverges from row.$pk is deduped', () => {
      const core = new RangedPulseMergeCore<TransformedRow>({
        order: 'asc',
        limit: null,
        rangeStart: null,
        rangeEnd: null,
      });
      core.rebuildFromRows([{ $pk: '7', label: 'a' }]);

      const changed = core.applyEvents([
        { op: 'insert', row: { $pk: '7', label: 'a-dup' }, pk: 7 },
      ]);
      expect(changed).toBe(false);
      expect(core.data).toHaveLength(1);
    });

    test('an update whose wire row carries no $pk is skipped whole', () => {
      const core = new RangedPulseMergeCore<WireRow>({
        order: 'asc',
        limit: null,
        rangeStart: null,
        rangeEnd: null,
      });
      core.rebuildFromRows([{ $pk: 1, label: 'a' }]);

      const changed = core.applyEvents([
        {
          op: 'update',
          row: { label: 'x' } as unknown as WireRow,
          old_row: {},
          pk: 1,
          matchesNew: false,
        },
      ]);
      expect(changed).toBe(false);
      expect(core.data).toHaveLength(1);
    });
  });

  describe('appendRows', () => {
    test('appends new rows and dedupes existing pks', () => {
      const core = new RangedPulseMergeCore<WireRow>({
        order: 'asc',
        limit: null,
        rangeStart: null,
        rangeEnd: null,
      });
      core.rebuildFromRows([{ $pk: 1, label: 'a' }]);

      const appended = core.appendRows([
        { $pk: 1, label: 'a-dup' },
        { $pk: 2, label: 'b' },
      ]);
      expect(appended).toBe(true);
      expect(core.data).toEqual([
        { $pk: 1, label: 'a' },
        { $pk: 2, label: 'b' },
      ]);
    });

    test('returns false when all rows are duplicates', () => {
      const core = new RangedPulseMergeCore<WireRow>({
        order: 'asc',
        limit: null,
        rangeStart: null,
        rangeEnd: null,
      });
      core.rebuildFromRows([{ $pk: 1, label: 'a' }]);

      const appended = core.appendRows([{ $pk: 1, label: 'a-dup' }]);
      expect(appended).toBe(false);
    });
  });

  describe('clear', () => {
    test('resets all state including the range window', () => {
      const core = new RangedPulseMergeCore<WireRow>({
        order: 'asc',
        limit: 10,
        rangeStart: 1,
        rangeEnd: 10,
      });
      core.rebuildFromRows([{ $pk: 1, label: 'a' }]);
      core.clear();

      expect(core.data).toHaveLength(0);
      expect(core.rangeStart).toBeNull();
      expect(core.rangeEnd).toBeNull();
      // pkMap must also be cleared — re-adding the same pk succeeds instead of being deduped
      const appended = core.appendRows([{ $pk: 1, label: 'a2' }]);
      expect(appended).toBe(true);
      expect(core.data).toEqual([{ $pk: 1, label: 'a2' }]);
    });
  });
});
