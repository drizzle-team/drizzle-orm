import type { PendingWalEvent } from '../../server/pulse-runtime.js';
import { extractRow } from '../../shared/event-normalization.js';
import { evaluateCondition } from '../../shared/filter-ast.js';
import { projectEmbeddedRows } from '../../shared/projection.js';
import type { ResolvedPulseQuery } from '../../types.js';
import type { PulseEvent } from './pulse-events.js';

// Must stay free of drizzle-orm/pg-core VALUE imports (bare `drizzle-orm` only): both
// createPulseClient's collections and createPulseEvents value-import buildTapEvent, and
// platform-imports.test.ts enforces purity across the embedded entrypoint's import graph.

export type TapRow = Record<string, unknown>;

/**
 * Builds a query-relative `PulseEvent` from a decoded WAL event, or `null` when the row is not
 * in the query result before or after the change. Update and delete carry a full old tuple
 * (the runtime forces REPLICA IDENTITY FULL on every source), so `query.where` is evaluated
 * on both sides. An update that makes a row match is an insert, and an update that makes it
 * stop matching is a delete. A side that does not match is never delivered, so column data
 * outside the query's scope never reaches the subscriber.
 */
export function buildTapEvent(
	event: PendingWalEvent,
	query: ResolvedPulseQuery,
): PulseEvent<TapRow> | null {
	// A delete's `row` is `{}`, which extractRow turns into null.
	const newRow = extractRow(event.row, query.columns);
	const oldRow = event.oldRow ? extractRow(event.oldRow, query.columns) : null;

	const matchedNew = newRow && evaluateCondition(query.where, newRow)
		? projectEmbeddedRows([newRow], query)[0] ?? null
		: null;
	const matchedOld = oldRow && evaluateCondition(query.where, oldRow)
		? projectEmbeddedRows([oldRow], query)[0] ?? null
		: null;

	if (matchedNew && matchedOld) {
		return { op: 'update', row: matchedNew.row, oldRow: matchedOld.row, pk: matchedNew.pk };
	}
	if (matchedNew) return { op: 'insert', row: matchedNew.row, pk: matchedNew.pk };
	if (matchedOld) return { op: 'delete', oldRow: matchedOld.row, pk: matchedOld.pk };
	return null;
}
