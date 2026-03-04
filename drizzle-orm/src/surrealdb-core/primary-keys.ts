import { entityKind } from '~/entity.ts';
import type { AnySurrealDBColumn, SurrealDBColumn } from './columns/common.ts';
import type { SurrealDBTable } from './table.ts';

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'SurrealDBPrimaryKeyBuilder';

	/** @internal */
	columns: SurrealDBColumn[];
	/** @internal */
	name?: string;

	constructor(columns: SurrealDBColumn[], name?: string) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: SurrealDBTable): PrimaryKey {
		return new PrimaryKey(table, this.columns, this.name);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'SurrealDBPrimaryKey';

	readonly columns: SurrealDBColumn[];
	readonly name?: string;

	constructor(readonly table: SurrealDBTable, columns: SurrealDBColumn[], name?: string) {
		this.columns = columns;
		this.name = name;
	}
}

export function primaryKey(
	...config: AnySurrealDBColumn[] | [{ name?: string; columns: AnySurrealDBColumn[] }]
): PrimaryKeyBuilder {
	if (config[0] && 'columns' in config[0]) {
		const { name, columns } = config[0];
		return new PrimaryKeyBuilder(columns as SurrealDBColumn[], name);
	}
	return new PrimaryKeyBuilder(config as SurrealDBColumn[]);
}
