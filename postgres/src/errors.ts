// PostgreSQL ErrorResponse / NoticeResponse field decoding.
// Field bytes: https://www.postgresql.org/docs/current/protocol-error-fields.html
import { addBrand } from './brand.ts';

const FIELD: Record<string, string> = {
	S: 'severityLocal',
	V: 'severity',
	C: 'code',
	M: 'message',
	D: 'detail',
	H: 'hint',
	P: 'position',
	p: 'internalPosition',
	q: 'internalQuery',
	W: 'where',
	s: 'schema',
	t: 'table',
	c: 'column',
	d: 'dataType',
	n: 'constraint',
	F: 'file',
	L: 'line',
	R: 'routine',
};

export interface PgErrorFields {
	severity?: string;
	code?: string; // SQLSTATE
	message?: string;
	detail?: string;
	hint?: string;
	position?: string;
	schema?: string;
	table?: string;
	column?: string;
	constraint?: string;
	[k: string]: string | undefined;
}

export class PgError extends Error {
	code?: string;
	severity?: string;
	detail?: string;
	hint?: string;
	position?: string;
	constraint?: string;
	/** A cancel request for an earlier query in the pipeline most likely stopped this query. */
	isLateCancel?: boolean;
	[k: string]: unknown;

	constructor(fields: PgErrorFields) {
		super(fields.message ?? 'PostgreSQL error');
		this.name = 'PgError';
		Object.assign(this, fields);
	}
}

addBrand(PgError, 'PgError');

/** Parse the body of an 'E'/'N' message: a run of (code-byte + cstring), terminated by \0. */
export function parseErrorFields(body: Buffer): PgErrorFields {
	const out: PgErrorFields = {};
	let i = 0;
	while (i < body.length && body[i] !== 0) {
		const code = String.fromCharCode(body[i]!);
		i += 1;
		let end = i;
		while (end < body.length && body[end] !== 0) end += 1;
		out[FIELD[code] ?? code] = body.toString('utf8', i, end);
		i = end + 1;
	}
	return out;
}
