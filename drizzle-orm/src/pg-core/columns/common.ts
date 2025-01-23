import type {
	ColumnBuilderBase,
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	HasGenerated,
	MakeColumnConfig,
} from '~/column-builder.ts';
import { ColumnBuilder } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { Simplify, Update } from '~/utils.ts';

import type { ForeignKey, UpdateDeleteAction } from '~/pg-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/pg-core/foreign-keys.ts';
import type { AnyPgTable, PgTable } from '~/pg-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import { iife } from '~/tracing-utils.ts';
import type { PgIndexOpClass } from '../indexes.ts';
import { uniqueKeyName } from '../unique-constraint.ts';
import { makePgArray, parsePgArray } from '../utils/array.ts';

export interface ReferenceConfig {
	ref: () => PgColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export interface PgColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> extends ColumnBuilderBase<T, TTypeConfig & { dialect: 'pg' }> {}

export abstract class PgColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'pg' }, TExtraConfig>
	implements PgColumnBuilderBase<T, TTypeConfig>
{
	private foreignKeyConfigs: ReferenceConfig[] = [];

	static override readonly [entityKind]: string = 'PgColumnBuilder';

	array<TSize extends number | undefined = undefined>(size?: TSize): PgArrayBuilder<
		& {
			name: T['name'];
			dataType: 'array';
			columnType: 'PgArray';
			data: T['data'][];
			driverParam: T['driverParam'][] | string;
			enumValues: T['enumValues'];
			size: TSize;
			baseBuilder: T;
		}
		& (T extends { notNull: true } ? { notNull: true } : {})
		& (T extends { hasDefault: true } ? { hasDefault: true } : {}),
		T
	> {
		return new PgArrayBuilder(this.config.name, this as PgColumnBuilder<any, any>, size as any);
	}

	references(
		ref: ReferenceConfig['ref'],
		actions: ReferenceConfig['actions'] = {},
	): this {
		this.foreignKeyConfigs.push({ ref, actions });
		return this;
	}

	unique(
		name?: string,
		config?: { nulls: 'distinct' | 'not distinct' },
	): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		this.config.uniqueType = config?.nulls;
		return this;
	}

	generatedAlwaysAs(as: SQL | T['data'] | (() => SQL)): HasGenerated<this, {
		type: 'always';
	}> {
		this.config.generated = {
			as,
			type: 'always',
			mode: 'stored',
		};
		return this as HasGenerated<this, {
			type: 'always';
		}>;
	}

	/** @internal */
	buildForeignKeys(column: PgColumn, table: PgTable): ForeignKey[] {
		return this.foreignKeyConfigs.map(({ ref, actions }) => {
			return iife(
				(ref, actions) => {
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
				},
				ref,
				actions,
			);
		});
	}

	/** @internal */
	abstract build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgColumn<MakeColumnConfig<T, TTableName>>;

	/** @internal */
	buildExtraConfigColumn<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): ExtraConfigColumn {
		return new ExtraConfigColumn(table, this.config);
	}
}

// To understand how to use `PgColumn` and `PgColumn`, see `Column` and `AnyColumn` documentation.
export abstract class PgColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig, TTypeConfig & { dialect: 'pg' }> {
	static override readonly [entityKind]: string = 'PgColumn';

	constructor(
		override readonly table: PgTable,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		if (!config.uniqueName) {
			config.uniqueName = uniqueKeyName(table, [config.name]);
		}
		super(table, config);
	}
}

export type IndexedExtraConfigType = { order?: 'asc' | 'desc'; nulls?: 'first' | 'last'; opClass?: string };

export class ExtraConfigColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
> extends PgColumn<T, IndexedExtraConfigType> {
	static override readonly [entityKind]: string = 'ExtraConfigColumn';

	override getSQLType(): string {
		return this.getSQLType();
	}

	indexConfig: IndexedExtraConfigType = {
		order: this.config.order ?? 'asc',
		nulls: this.config.nulls ?? 'last',
		opClass: this.config.opClass,
	};
	defaultConfig: IndexedExtraConfigType = {
		order: 'asc',
		nulls: 'last',
		opClass: undefined,
	};

	asc(): Omit<this, 'asc' | 'desc'> {
		this.indexConfig.order = 'asc';
		return this;
	}

	desc(): Omit<this, 'asc' | 'desc'> {
		this.indexConfig.order = 'desc';
		return this;
	}

	nullsFirst(): Omit<this, 'nullsFirst' | 'nullsLast'> {
		this.indexConfig.nulls = 'first';
		return this;
	}

	nullsLast(): Omit<this, 'nullsFirst' | 'nullsLast'> {
		this.indexConfig.nulls = 'last';
		return this;
	}

	/**
	 * ### PostgreSQL documentation quote
	 *
	 * > An operator class with optional parameters can be specified for each column of an index.
	 * The operator class identifies the operators to be used by the index for that column.
	 * For example, a B-tree index on four-byte integers would use the int4_ops class;
	 * this operator class includes comparison functions for four-byte integers.
	 * In practice the default operator class for the column's data type is usually sufficient.
	 * The main point of having operator classes is that for some data types, there could be more than one meaningful ordering.
	 * For example, we might want to sort a complex-number data type either by absolute value or by real part.
	 * We could do this by defining two operator classes for the data type and then selecting the proper class when creating an index.
	 * More information about operator classes check:
	 *
	 * ### Useful links
	 * https://www.postgresql.org/docs/current/sql-createindex.html
	 *
	 * https://www.postgresql.org/docs/current/indexes-opclass.html
	 *
	 * https://www.postgresql.org/docs/current/xindex.html
	 *
	 * ### Additional types
	 * If you have the `pg_vector` extension installed in your database, you can use the
	 * `vector_l2_ops`, `vector_ip_ops`, `vector_cosine_ops`, `vector_l1_ops`, `bit_hamming_ops`, `bit_jaccard_ops`, `halfvec_l2_ops`, `sparsevec_l2_ops` options, which are predefined types.
	 *
	 * **You can always specify any string you want in the operator class, in case Drizzle doesn't have it natively in its types**
	 *
	 * @param opClass
	 * @returns
	 */
	op(opClass: PgIndexOpClass): Omit<this, 'op'> {
		this.indexConfig.opClass = opClass;
		return this;
	}
}

export class IndexedColumn {
	static readonly [entityKind]: string = 'IndexedColumn';
	constructor(
		name: string | undefined,
		keyAsName: boolean,
		type: string,
		indexConfig: IndexedExtraConfigType,
	) {
		this.name = name;
		this.keyAsName = keyAsName;
		this.type = type;
		this.indexConfig = indexConfig;
	}

	name: string | undefined;
	keyAsName: boolean;
	type: string;
	indexConfig: IndexedExtraConfigType;
}

export type AnyPgColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> = PgColumn<
	Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
>;

export type PgArrayColumnBuilderBaseConfig = ColumnBuilderBaseConfig<'array', 'PgArray'> & {
	size: number | undefined;
	baseBuilder: ColumnBuilderBaseConfig<ColumnDataType, string>;
};

export class PgArrayBuilder<
	T extends PgArrayColumnBuilderBaseConfig,
	TBase extends ColumnBuilderBaseConfig<ColumnDataType, string> | PgArrayColumnBuilderBaseConfig,
> extends PgColumnBuilder<
	T,
	{
		baseBuilder: TBase extends PgArrayColumnBuilderBaseConfig ? PgArrayBuilder<
				TBase,
				TBase extends { baseBuilder: infer TBaseBuilder extends ColumnBuilderBaseConfig<any, any> } ? TBaseBuilder
					: never
			>
			: PgColumnBuilder<TBase, {}, Simplify<Omit<TBase, keyof ColumnBuilderBaseConfig<any, any>>>>;
		size: T['size'];
	},
	{
		baseBuilder: TBase extends PgArrayColumnBuilderBaseConfig ? PgArrayBuilder<
				TBase,
				TBase extends { baseBuilder: infer TBaseBuilder extends ColumnBuilderBaseConfig<any, any> } ? TBaseBuilder
					: never
			>
			: PgColumnBuilder<TBase, {}, Simplify<Omit<TBase, keyof ColumnBuilderBaseConfig<any, any>>>>;
		size: T['size'];
	}
> {
	static override readonly [entityKind] = 'PgArrayBuilder';

	constructor(
		name: string,
		baseBuilder: PgArrayBuilder<T, TBase>['config']['baseBuilder'],
		size: T['size'],
	) {
		super(name, 'array', 'PgArray');
		this.config.baseBuilder = baseBuilder;
		this.config.size = size;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgArray<MakeColumnConfig<T, TTableName> & { size: T['size']; baseBuilder: T['baseBuilder'] }, TBase> {
		const baseColumn = this.config.baseBuilder.build(table);
		return new PgArray<MakeColumnConfig<T, TTableName> & { size: T['size']; baseBuilder: T['baseBuilder'] }, TBase>(
			table as AnyPgTable<{ name: MakeColumnConfig<T, TTableName>['tableName'] }>,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			baseColumn,
		);
	}
}

export class PgArray<
	T extends ColumnBaseConfig<'array', 'PgArray'> & {
		size: number | undefined;
		baseBuilder: ColumnBuilderBaseConfig<ColumnDataType, string>;
	},
	TBase extends ColumnBuilderBaseConfig<ColumnDataType, string>,
> extends PgColumn<T, {}, { size: T['size']; baseBuilder: T['baseBuilder'] }> {
	readonly size: T['size'];

	static override readonly [entityKind]: string = 'PgArray';

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgArrayBuilder<T, TBase>['config'],
		readonly baseColumn: PgColumn,
		readonly range?: [number | undefined, number | undefined],
	) {
		super(table, config);
		this.size = config.size;
	}

	getSQLType(): string {
		return `${this.baseColumn.getSQLType()}[${typeof this.size === 'number' ? this.size : ''}]`;
	}

	override mapFromDriverValue(value: unknown[] | string): T['data'] {
		if (typeof value === 'string') {
			// Thank you node-postgres for not parsing enum arrays
			value = parsePgArray(value);
		}
		return value.map((v) => this.baseColumn.mapFromDriverValue(v));
	}

	override mapToDriverValue(value: unknown[], isNestedArray = false): unknown[] | string {
		const a = value.map((v) =>
			v === null
				? null
				: is(this.baseColumn, PgArray)
				? this.baseColumn.mapToDriverValue(v as unknown[], true)
				: this.baseColumn.mapToDriverValue(v)
		);
		if (isNestedArray) return a;
		return makePgArray(a);
	}
}
