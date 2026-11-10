// Events are relative to the query result: `insert` means a row entered it, `update` means a
// row changed and stayed in it, and `delete` means a row left it.

/** A row entered the query result: a matching insert, or an update that made the row match. */
export type PulseInsertEvent<TRow> = {
	op: 'insert';
	row: TRow;
	pk: unknown;
};

/** A row in the query result changed and still matches. */
export type PulseUpdateEvent<TRow> = {
	op: 'update';
	row: TRow;
	oldRow: TRow;
	pk: unknown;
};

/** A row left the query result: a delete of a matching row, or an update that made it stop matching. */
export type PulseDeleteEvent<TRow> = {
	op: 'delete';
	oldRow: TRow;
	pk: unknown;
};

export type PulseEvent<TRow> =
	| PulseInsertEvent<TRow>
	| PulseUpdateEvent<TRow>
	| PulseDeleteEvent<TRow>;
