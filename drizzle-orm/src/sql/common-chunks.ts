import { entityKind, is } from '~/entity.ts';
import { SQL, type SQLWrapper } from './sql.ts';

export class StringChunk implements SQLWrapper {
	static readonly [entityKind]: string = 'StringChunk';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(readonly value: string) {}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}

/** Shared string chunks, keyed by their values */
export const commonStringChunks = {
	', ': new StringChunk(', '),
	' ': new StringChunk(' '),
	'(': new StringChunk('('),
	')': new StringChunk(')'),
	'((': new StringChunk('(('),
	'))': new StringChunk('))'),
	'), (': new StringChunk('), ('),
	'.': new StringChunk('.'),
	default: new StringChunk('default'),
	null: new StringChunk('null'),
	'1 = 0': new StringChunk('1 = 0'),
	'1 = 1': new StringChunk('1 = 1'),
	// Operators
	' = ': new StringChunk(' = '),
	' <> ': new StringChunk(' <> '),
	' > ': new StringChunk(' > '),
	' >= ': new StringChunk(' >= '),
	' < ': new StringChunk(' < '),
	' <= ': new StringChunk(' <= '),
	' in ': new StringChunk(' in '),
	' not in ': new StringChunk(' not in '),
	') and (': new StringChunk(') and ('),
	') or (': new StringChunk(') or ('),
	'not (': new StringChunk('not ('),
	// Clauses
	'with ': new StringChunk('with '),
	'select ': new StringChunk('select '),
	'(select ': new StringChunk('(select '),
	'values ': new StringChunk('values '),
	' from ': new StringChunk(' from '),
	'.* from ': new StringChunk('.* from '),
	' as ': new StringChunk(' as '),
	') as ': new StringChunk(') as '),
	' inner join ': new StringChunk(' inner join '),
	' cross join ': new StringChunk(' cross join '),
	' on ': new StringChunk(' on '),
	' where ': new StringChunk(' where '),
	' order by ': new StringChunk(' order by '),
	' asc': new StringChunk(' asc'),
	' desc': new StringChunk(' desc'),
	' limit ': new StringChunk(' limit '),
	' limit 1': new StringChunk(' limit 1'),
	' offset ': new StringChunk(' offset '),
	'top(1) ': new StringChunk('top(1) '),
	// Relational queries
	'exists (select * from ': new StringChunk('exists (select * from '),
	'not exists (select * from ': new StringChunk('not exists (select * from '),
	'select count(*) as ': new StringChunk('select count(*) as '),
	'(select count(*) from ': new StringChunk('(select count(*) from '),
	'min(': new StringChunk('min('),
	'max(': new StringChunk('max('),
	'count(': new StringChunk('count('),
	'avg(': new StringChunk('avg('),
	'first(': new StringChunk('first('),
} as const satisfies Record<string, StringChunk>;
