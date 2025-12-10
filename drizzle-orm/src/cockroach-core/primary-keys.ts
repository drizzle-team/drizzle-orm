import { entityKind } from '~/entity.ts';
import type { AnyCockroachColumn, CockroachColumn } from './columns/index.ts';
import type { CockroachTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumn extends AnyCockroachColumn<{ tableName: TTableName }>,
	TColumns extends AnyCockroachColumn<{ tableName: TTableName }>[],
>(config: { name?: string; columns: [TColumn, ...TColumns] }): PrimaryKeyBuilder {
	return new PrimaryKeyBuilder(config.columns, config.name);
}

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'CockroachPrimaryKeyBuilder';

	/** @internal */
	columns: CockroachColumn[];

	/** @internal */
	name?: string;

	constructor(
		columns: CockroachColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: CockroachTable): PrimaryKey {
		return new PrimaryKey(table, this.columns, this.name);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'CockroachPrimaryKey';

	readonly columns: AnyCockroachColumn<{}>[];
	readonly name?: string;
	readonly isNameExplicit: boolean;

	constructor(readonly table: CockroachTable, columns: AnyCockroachColumn<{}>[], name?: string) {
		this.columns = columns;
		this.name = name;
		this.isNameExplicit = !!name;
	}

	getName(): string | undefined {
		return this.name;
	}
}
