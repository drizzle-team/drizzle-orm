import { Column } from 'drizzle-orm';
import { ColumnData, ColumnHasDefault, ColumnNotNull, TableName, Unwrap } from 'drizzle-orm/branded-types';
import { ColumnBuilder } from 'drizzle-orm/column-builder';
import { Simplify } from 'type-fest';

import { PgColumnDriverParam } from '~/branded-types';
import { AnyForeignKey, ForeignKeyBuilder, UpdateDeleteAction } from '~/foreign-keys';
import { AnyPgSQL } from '~/sql';
import { AnyPgTable } from '~/table';

export interface ReferenceConfig<TData extends ColumnData> {
	ref: () => AnyPgColumn<any, TData>;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class PgColumnBuilder<
	TData extends ColumnData,
	TDriverParam extends PgColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends ColumnBuilder<TData, TDriverParam, TNotNull, THasDefault> {
	private foreignKeyConfigs: ReferenceConfig<TData>[] = [];

	constructor(name: string) {
		super(name);
	}

	override notNull(): PgColumnBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		return super.notNull() as any;
	}

	override default(
		value: Unwrap<TData> | AnyPgSQL,
	): PgColumnBuilder<TData, TDriverParam, TNotNull, ColumnHasDefault<true>> {
		return super.default(value) as any;
	}

	override primaryKey(): PgColumnBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		return super.primaryKey() as any;
	}

	references(
		ref: ReferenceConfig<TData>['ref'],
		actions: ReferenceConfig<TData>['actions'] = {},
	): this {
		this.foreignKeyConfigs.push({ ref, actions });
		return this;
	}

	/** @internal */
	buildForeignKeys(column: AnyPgColumn, table: AnyPgTable): AnyForeignKey[] {
		return this.foreignKeyConfigs.map(({ ref, actions }) => {
			const builder = new ForeignKeyBuilder(() => {
				const foreignColumn = ref();
				return { columns: [column], foreignColumns: [foreignColumn] };
			});
			if (actions.onUpdate) {
				builder.onUpdate(actions.onUpdate);
			}
			if (actions.onDelete) {
				builder.onDelete(actions.onDelete);
			}
			return builder.build(table);
		});
	}

	/** @internal */
	abstract override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault>;
}

export type AnyPgColumnBuilder = PgColumnBuilder<any, any, any, any>;

export abstract class PgColumn<
	TTableName extends TableName<string>,
	TDataType extends ColumnData,
	TDriverData extends PgColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends Column<TTableName, TDataType, TDriverData, TNotNull, THasDefault> {
	override readonly table!: AnyPgTable<TTableName>;

	constructor(
		table: AnyPgTable<TTableName>,
		builder: PgColumnBuilder<TDataType, TDriverData, TNotNull, THasDefault>,
	) {
		super(table, builder);
	}
}

export abstract class PgColumnWithMapper<
	TTableName extends TableName,
	TData extends ColumnData,
	TDriverParam extends PgColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault> {
	override mapFromDriverValue = (value: TDriverParam): TData => {
		return value as unknown as TData;
	};

	override mapToDriverValue = (value: TData): TDriverParam => {
		return value as unknown as TDriverParam;
	};
}

export type AnyPgColumn<
	TTableName extends TableName = any,
	TData extends ColumnData = any,
	TDriverParam extends PgColumnDriverParam = PgColumnDriverParam,
	TNotNull extends ColumnNotNull = any,
	THasDefault extends ColumnHasDefault = any,
> = PgColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault>;

export type AnyPgColumnWithMapper<
	TTableName extends TableName = TableName,
	TData extends ColumnData = any,
	TDriverParam extends PgColumnDriverParam = PgColumnDriverParam,
	TNotNull extends ColumnNotNull = ColumnNotNull,
	THasDefault extends ColumnHasDefault = ColumnHasDefault,
> = PgColumnWithMapper<TTableName, TData, TDriverParam, TNotNull, THasDefault>;

export type BuildPgColumn<TTableName extends TableName, TBuilder extends AnyPgColumnBuilder> = TBuilder extends
	PgColumnBuilder<
		infer TData,
		infer TDriverParam,
		infer TNotNull,
		infer THasDefault
	> ? PgColumnWithMapper<TTableName, TData, TDriverParam, TNotNull, THasDefault>
	: never;

export type BuildPgColumns<
	TTableName extends TableName,
	TConfigMap extends Record<string, AnyPgColumnBuilder>,
> = Simplify<
	{
		[Key in keyof TConfigMap]: BuildPgColumn<TTableName, TConfigMap[Key]>;
	}
>;
