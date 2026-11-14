import { entityKind } from '~/entity.ts';

/**
 * A row that cannot be sent as a body — an unknown column, or a value that is a SQL expression.
 *
 * Distinct from a query failure because it is one: the statement never reached the server. Rows are
 * mapped lazily so a stream can be larger than memory, which means these surface from inside the
 * driver's insert, and without a type to recognise them by they would be wrapped as
 * `DrizzleQueryError` and read as "ClickHouse rejected this".
 *
 * Its own module rather than `query-builders/insert.ts` so the dialect can throw it without taking a
 * runtime dependency on the builder that consumes the dialect.
 */
export class ClickHouseInsertValueError extends Error {
	static readonly [entityKind]: string = 'ClickHouseInsertValueError';

	constructor(message: string) {
		super(message);
		this.name = 'ClickHouseInsertValueError';
	}
}
