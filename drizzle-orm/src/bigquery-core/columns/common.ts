import type { AnyBigQueryTable, BigQueryTable } from '~/bigquery-core/table.ts';
import { ColumnBuilder } from '~/column-builder.ts';
import type {
	ColumnBuilderBase,
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	HasGenerated,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { Simplify, Update } from '~/utils.ts';
import { uniqueKeyName } from '../unique-constraint.ts';

export interface BigQueryColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> extends ColumnBuilderBase<T, TTypeConfig & { dialect: 'bigquery' }> {}

export interface BigQueryGeneratedColumnConfig {
	mode?: 'stored';
}

export abstract class BigQueryColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string> & {
		data: any;
	},
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'bigquery' }, TExtraConfig>
	implements BigQueryColumnBuilderBase<T, TTypeConfig>
{
	static override readonly [entityKind]: string = 'BigQueryColumnBuilder';

	// BigQuery doesn't enforce foreign keys, but we keep the pattern for schema documentation
	unique(name?: string): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		return this;
	}

	/**
	 * Creates an ARRAY column type wrapping this column's type.
	 *
	 * @example
	 * ```ts
	 * const table = bigqueryTable('test', {
	 *   tags: string('tags').array(),
	 *   scores: int64('scores').array(),
	 * });
	 * ```
	 */
	array(): BigQueryArrayBuilder<
		& {
			name: T['name'];
			dataType: 'array';
			columnType: 'BigQueryArray';
			data: T['data'][];
			driverParam: T['driverParam'][];
			enumValues: T['enumValues'];
			baseBuilder: T;
		}
		& (T extends { notNull: true } ? { notNull: true } : {})
		& (T extends { hasDefault: true } ? { hasDefault: true } : {}),
		T
	> {
		return new BigQueryArrayBuilder(this.config.name, this as BigQueryColumnBuilder<any, any>);
	}

	generatedAlwaysAs(as: SQL | T['data'] | (() => SQL), config?: BigQueryGeneratedColumnConfig): HasGenerated<this, {
		type: 'always';
	}> {
		this.config.generated = {
			as,
			type: 'always',
			mode: config?.mode ?? 'stored',
		};
		return this as any;
	}

	/** @internal */
	abstract build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryColumn<MakeColumnConfig<T, TTableName>>;
}

// To understand how to use `BigQueryColumn` and `AnyBigQueryColumn`, see `Column` and `AnyColumn` documentation.
export abstract class BigQueryColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig, TTypeConfig & { dialect: 'bigquery' }> {
	static override readonly [entityKind]: string = 'BigQueryColumn';

	constructor(
		override readonly table: BigQueryTable,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		if (!config.uniqueName) {
			config.uniqueName = uniqueKeyName(table, [config.name]);
		}
		super(table, config);
	}
}

export type AnyBigQueryColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> = BigQueryColumn<
	Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
>;

// ARRAY type support
export type BigQueryArrayColumnBuilderBaseConfig = ColumnBuilderBaseConfig<'array', 'BigQueryArray'> & {
	baseBuilder: ColumnBuilderBaseConfig<ColumnDataType, string>;
};

export class BigQueryArrayBuilder<
	T extends BigQueryArrayColumnBuilderBaseConfig,
	TBase extends ColumnBuilderBaseConfig<ColumnDataType, string> | BigQueryArrayColumnBuilderBaseConfig,
> extends BigQueryColumnBuilder<
	T,
	{
		baseBuilder: TBase extends BigQueryArrayColumnBuilderBaseConfig ? BigQueryArrayBuilder<
				TBase,
				TBase extends { baseBuilder: infer TBaseBuilder extends ColumnBuilderBaseConfig<any, any> } ? TBaseBuilder
					: never
			>
			: BigQueryColumnBuilder<TBase, {}, Simplify<Omit<TBase, keyof ColumnBuilderBaseConfig<any, any>>>>;
	},
	{
		baseBuilder: TBase extends BigQueryArrayColumnBuilderBaseConfig ? BigQueryArrayBuilder<
				TBase,
				TBase extends { baseBuilder: infer TBaseBuilder extends ColumnBuilderBaseConfig<any, any> } ? TBaseBuilder
					: never
			>
			: BigQueryColumnBuilder<TBase, {}, Simplify<Omit<TBase, keyof ColumnBuilderBaseConfig<any, any>>>>;
	}
> {
	static override readonly [entityKind] = 'BigQueryArrayBuilder';

	constructor(
		name: string,
		baseBuilder: BigQueryArrayBuilder<T, TBase>['config']['baseBuilder'],
	) {
		super(name, 'array', 'BigQueryArray');
		this.config.baseBuilder = baseBuilder;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryArray<MakeColumnConfig<T, TTableName> & { baseBuilder: T['baseBuilder'] }, TBase> {
		const baseColumn = this.config.baseBuilder.build(table);
		return new BigQueryArray<MakeColumnConfig<T, TTableName> & { baseBuilder: T['baseBuilder'] }, TBase>(
			table as AnyBigQueryTable<{ name: MakeColumnConfig<T, TTableName>['tableName'] }>,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			baseColumn,
		);
	}
}

export class BigQueryArray<
	T extends ColumnBaseConfig<'array', 'BigQueryArray'> & {
		baseBuilder: ColumnBuilderBaseConfig<ColumnDataType, string>;
	},
	TBase extends ColumnBuilderBaseConfig<ColumnDataType, string>,
> extends BigQueryColumn<T, {}, { baseBuilder: T['baseBuilder'] }> {
	static override readonly [entityKind]: string = 'BigQueryArray';

	constructor(
		table: AnyBigQueryTable<{ name: T['tableName'] }>,
		config: BigQueryArrayBuilder<T, TBase>['config'],
		readonly baseColumn: BigQueryColumn,
	) {
		super(table as BigQueryTable, config);
	}

	getSQLType(): string {
		return `ARRAY<${this.baseColumn.getSQLType()}>`;
	}

	// BigQuery returns arrays as native JavaScript arrays, so no special parsing needed
	// Unlike PostgreSQL which returns arrays as strings like "{val1,val2}"
	override mapFromDriverValue(value: unknown[]): T['data'] {
		return value.map((v) => this.baseColumn.mapFromDriverValue(v));
	}

	override mapToDriverValue(value: unknown[], isNestedArray = false): unknown[] {
		const a = value.map((v) =>
			v === null
				? null
				: is(this.baseColumn, BigQueryArray)
				? (this.baseColumn as unknown as BigQueryArray<any, any>).mapToDriverValue(v as unknown[], true)
				: this.baseColumn.mapToDriverValue(v)
		);
		return a;
	}
}
