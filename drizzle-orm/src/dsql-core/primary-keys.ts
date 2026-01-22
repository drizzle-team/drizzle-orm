import { entityKind } from '~/entity.ts';
import type { AnyDSQLColumn } from './columns/common.ts';
import type { DSQLTable } from './table.ts';

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'DSQLPrimaryKeyBuilder';

	constructor(columns: AnyDSQLColumn[], name?: string) {
		throw new Error('Method not implemented.');
	}

	/** @internal */
	build(table: DSQLTable): PrimaryKey {
		throw new Error('Method not implemented.');
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'DSQLPrimaryKey';

	readonly columns: AnyDSQLColumn[];
	readonly name?: string;

	constructor(table: DSQLTable, columns: AnyDSQLColumn[], name?: string) {
		throw new Error('Method not implemented.');
	}

	getName(): string {
		throw new Error('Method not implemented.');
	}
}

export function primaryKey<TColumns extends AnyDSQLColumn[]>(config: {
	columns: TColumns;
	name?: string;
}): PrimaryKeyBuilder {
	return new PrimaryKeyBuilder(config.columns, config.name);
}
