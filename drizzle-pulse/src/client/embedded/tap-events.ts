import type { PendingWalEvent } from '../../server/pulse-runtime.js';
import { extractRow } from '../../shared/event-normalization.js';
import { evaluateCondition } from '../../shared/filter-ast.js';
import { projectEmbeddedRows } from '../../shared/projection.js';
import type { PulseEvent } from '../../shared/pulse-events.js';
import type { ResolvedPulseQuery } from '../../types.js';

// Must stay free of drizzle-orm/pg-core VALUE imports (bare `drizzle-orm` only): both
// createPulseClient's collections and createPulseEvents value-import buildTapEvent, and
// platform-imports.test.ts enforces purity across the embedded entrypoint's import graph.

export type TapRow = Record<string, unknown>;

/**
 * Builds a `PulseEvent` from a decoded WAL event, or `null` when the event should not be
 * delivered at all. Insert is gated on `query.where` matching the new row. Update/delete carry
 * a full old tuple (the runtime forces REPLICA IDENTITY FULL on every source), so `query.where`
 * is evaluated against both sides: an event neither side matches was never visible to this
 * subscriber and is suppressed. Each side of a delivered update is included only when that
 * side matches the WHERE — the non-matching side ships as an empty object with the event's
 * `pk` field carrying the identity — so out-of-scope column data (the new row of a
 * membership removal, the old row of a membership entry) never reaches the subscriber.
 */
export function buildTapEvent(
  event: PendingWalEvent,
  query: ResolvedPulseQuery,
): PulseEvent<TapRow> | null {
  // Delete events carry an empty `row` object (not null); extractRow returns null when
  // every column is absent, so the delete case falls out of this call for free.
  const newRow = extractRow(event.row, query.columns);
  const oldRow = event.oldRow ? extractRow(event.oldRow, query.columns) : null;

  const matchesNew = newRow ? evaluateCondition(query.where, newRow) : false;
  const matchesOld = oldRow ? evaluateCondition(query.where, oldRow) : false;

  if (event.op === 'insert') {
    if (!matchesNew || !newRow) return null;
    const [projected] = projectEmbeddedRows([newRow], query);
    if (!projected) return null;
    return { op: 'insert', row: projected.row, pk: projected.pk };
  }

  if (event.op === 'update') {
    if (!matchesNew && !matchesOld) return null;
    const projectedNew = newRow ? projectEmbeddedRows([newRow], query)[0] : null;
    const projectedOld = oldRow ? projectEmbeddedRows([oldRow], query)[0] : null;
    const fallback = projectedNew ?? projectedOld;
    if (!fallback) return null;
    return {
      op: 'update',
      row: matchesNew && projectedNew ? projectedNew.row : {},
      old_row: matchesOld && projectedOld ? projectedOld.row : {},
      pk: fallback.pk,
      matchesNew,
    };
  }

  // delete
  if (!oldRow || !matchesOld) return null;
  const [projected] = projectEmbeddedRows([oldRow], query);
  if (!projected) return null;
  return { op: 'delete', old_row: projected.row, pk: projected.pk };
}
