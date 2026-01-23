import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { AnyDSQLColumn, ExtraConfigColumn, IndexedColumn } from './columns/common.ts';
import type { DSQLTable } from './table.ts';

export type IndexType = 'btree' | 'hash';

export interface IndexConfig {
	name: string;
	columns: IndexedColumn[];
	unique: boolean;
	where?: SQL;
	concurrently?: boolean;
	using?: IndexType;
}

export class IndexBuilder {
	static readonly [entityKind]: string = 'DSQLIndexBuilder';

	constructor(_name: string) {
		throw new Error('Method not implemented.');
	}

	on(..._columns: (AnyDSQLColumn | ExtraConfigColumn | SQL)[]): this {
		throw new Error('Method not implemented.');
	}

	using(_method: IndexType): this {
		throw new Error('Method not implemented.');
	}

	where(_condition: SQL): this {
		throw new Error('Method not implemented.');
	}

	concurrently(): this {
		throw new Error('Method not implemented.');
	}

	/** @internal */
	build(_table: DSQLTable): Index {
		throw new Error('Method not implemented.');
	}
}

export class Index {
	static readonly [entityKind]: string = 'DSQLIndex';

	readonly config: IndexConfig;

	constructor(_config: IndexConfig, _table: DSQLTable) {
		throw new Error('Method not implemented.');
	}
}

export type AnyIndexBuilder = IndexBuilder;

export function index(name: string): IndexBuilder {
	return new IndexBuilder(name);
}

export function uniqueIndex(_name: string): IndexBuilder {
	throw new Error('Method not implemented.');
}
