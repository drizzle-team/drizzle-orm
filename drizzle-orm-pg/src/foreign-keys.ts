import { AnyPgColumn, PgColumn } from './columns';
import { AnyPgTable } from './table';

export class ForeignKeyBuilder<TTableName extends string, TForeignTableName extends string> {
	protected brand!: 'PgForeignKeyBuilder';

	constructor(
		private config: () => readonly [
			columns: AnyPgColumn<TTableName>[],
			foreignTable: AnyPgTable<TForeignTableName>,
			foreignColumns: AnyPgColumn<TForeignTableName>[],
		],
	) {}

	build(table: AnyPgTable<TTableName>): ForeignKey<TTableName, TForeignTableName> {
		return new ForeignKey(table, this.config);
	}
}

export type AnyForeignKeyBuilder = ForeignKeyBuilder<string, string>;

export class ForeignKey<TTableName extends string, TForeignTableName extends string> {
	constructor(
		readonly table: AnyPgTable<TTableName>,
		readonly config: () => readonly [
			columns: AnyPgColumn<TTableName>[],
			foreignTable: AnyPgTable<TForeignTableName>,
			foreignColumns: AnyPgColumn<TForeignTableName>[],
		],
	) {}
}

export type AnyForeignKey = ForeignKey<string, string>;

type ColumnsWithTable<
	TTableName extends string,
	TColumns extends AnyPgColumn | [AnyPgColumn, ...AnyPgColumn[]],
> = TColumns extends PgColumn<any, infer TType, any, any, any>
	? PgColumn<TTableName, TType, any, any, any>
	: TColumns extends AnyPgColumn[]
	? {
			[Key in keyof TColumns]: TColumns[Key] extends PgColumn<any, infer TType, any, any, any>
				? PgColumn<TTableName, TType, any, any, any>
				: never;
	  }
	: never;

type GetColumnsTable<TColumns extends AnyPgColumn | AnyPgColumn[]> = (
	TColumns extends AnyPgColumn
		? TColumns
		: TColumns extends AnyPgColumn[]
		? TColumns[number]
		: never
) extends AnyPgColumn<infer TTableName>
	? TTableName
	: never;

export function foreignKey<
	TColumns extends AnyPgColumn | [AnyPgColumn, ...AnyPgColumn[]],
	TForeignTableName extends string,
>(
	config: () => [
		columns: TColumns,
		foreignTable: AnyPgTable<TForeignTableName>,
		foreignColumns: ColumnsWithTable<TForeignTableName, TColumns>,
	],
) {
	function mappedConfig() {
		const [columns, foreignTable, foreignColumns] = config();
		return [
			(columns instanceof PgColumn ? [columns] : columns) as AnyPgColumn<
				GetColumnsTable<TColumns>
			>[],
			foreignTable,
			(foreignColumns instanceof PgColumn
				? [foreignColumns]
				: foreignColumns) as AnyPgColumn<TForeignTableName>[],
		] as const;
	}

	return new ForeignKeyBuilder(mappedConfig) as ForeignKeyBuilder<
		GetColumnsTable<TColumns>,
		TForeignTableName
	>;
}
