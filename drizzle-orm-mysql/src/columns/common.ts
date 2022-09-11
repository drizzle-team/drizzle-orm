import { Column } from 'drizzle-orm';
import { ColumnData, ColumnHasDefault, ColumnNotNull, TableName, Unwrap } from 'drizzle-orm/branded-types';
import { ColumnBuilder } from 'drizzle-orm/column-builder';
import { Simplify } from 'type-fest';
import { MySqlColumnDriverParam } from '~/branded-types';
import { AnyForeignKey, ForeignKeyBuilder, UpdateDeleteAction } from '~/foreign-keys';
import { AnyMySQL } from '~/sql';
import { AnyMySqlTable } from '~/table';

export interface ReferenceConfig<TData extends ColumnData> {
	ref: () => AnyMySqlColumn<any, TData>;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class MySqlColumnBuilder<
	TData extends ColumnData,
	TDriverParam extends MySqlColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends ColumnBuilder<TData, TDriverParam, TNotNull, THasDefault> {
	private foreignKeyConfigs: ReferenceConfig<TData>[] = [];

	constructor(name: string) {
		super(name);
	}

	override notNull(): MySqlColumnBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		return super.notNull() as ReturnType<this['notNull']>;
	}

	override default(
		value: Unwrap<TData> | AnyMySQL,
	): MySqlColumnBuilder<TData, TDriverParam, TNotNull, ColumnHasDefault<true>> {
		return super.default(value) as ReturnType<this['default']>;
	}

	override primaryKey(): MySqlColumnBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		return super.primaryKey() as ReturnType<this['primaryKey']>;
	}

	references(
		ref: ReferenceConfig<TData>['ref'],
		actions: ReferenceConfig<TData>['actions'] = {},
	): this {
		this.foreignKeyConfigs.push({ ref, actions });
		return this;
	}

	/** @internal */
	buildForeignKeys(column: AnyMySqlColumn, table: AnyMySqlTable): AnyForeignKey[] {
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
		table: AnyMySqlTable<TTableName>,
	): MySqlColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault>;
}

export abstract class MySqlColumnBuilderWithAutoIncrement<
	TData extends ColumnData,
	TDriverParam extends MySqlColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumnBuilder<TData, TDriverParam, TNotNull, THasDefault> {
	/** @internal */ _autoIncrement = false;

	autoIncrement(): MySqlColumnBuilderWithAutoIncrement<
		TData,
		TDriverParam,
		TNotNull,
		ColumnHasDefault<true>
	> {
		this._autoIncrement = true;
		return this as ReturnType<this['autoIncrement']>;
	}
}

export type AnyMySqlColumnBuilder = MySqlColumnBuilder<any, any, any, any>;

export abstract class MySqlColumn<
	TTableName extends TableName,
	TDataType extends ColumnData,
	TDriverData extends MySqlColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends Column<TTableName, TDataType, TDriverData, TNotNull, THasDefault> {
	readonly autoIncrement!: boolean;

	constructor(
		override readonly table: AnyMySqlTable<TTableName>,
		builder: MySqlColumnBuilder<TDataType, TDriverData, TNotNull, THasDefault>,
	) {
		super(table, builder);
	}

	unsafe(): AnyMySqlColumn {
		return this;
	}
}

export abstract class MySqlColumnWithAutoIncrement<
	TTableName extends TableName<string>,
	TDataType extends ColumnData,
	TDriverData extends MySqlColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumn<TTableName, TDataType, TDriverData, TNotNull, THasDefault> {
	override readonly autoIncrement: boolean;

	constructor(
		override readonly table: AnyMySqlTable<TTableName>,
		builder: MySqlColumnBuilderWithAutoIncrement<TDataType, TDriverData, TNotNull, THasDefault>,
	) {
		super(table, builder);
		this.autoIncrement = builder._autoIncrement;
	}
}

export type AnyMySqlColumn<
	TTableName extends TableName = any,
	TData extends ColumnData = any,
	TDriverParam extends MySqlColumnDriverParam = MySqlColumnDriverParam,
	TNotNull extends ColumnNotNull = any,
	THasDefault extends ColumnHasDefault = any,
> = MySqlColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault>;

export type BuildMySqlColumn<TTableName extends TableName, TBuilder extends AnyMySqlColumnBuilder> = TBuilder extends
	MySqlColumnBuilder<
		infer TData,
		infer TDriverParam,
		infer TNotNull,
		infer THasDefault
	> ? MySqlColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault>
	: never;

export type BuildMySqlColumns<
	TTableName extends TableName,
	TConfigMap extends Record<string, AnyMySqlColumnBuilder>,
> = Simplify<
	{
		[Key in keyof TConfigMap]: BuildMySqlColumn<TTableName, TConfigMap[Key]>;
	}
>;

export type ChangeColumnTable<TColumn extends AnyMySqlColumn, TAlias extends TableName> = TColumn extends
	MySqlColumn<any, infer TData, infer TDriverParam, infer TNotNull, infer THasDefault> ? MySqlColumn<
		TAlias,
		TData,
		TDriverParam,
		TNotNull,
		THasDefault
	>
	: never;
