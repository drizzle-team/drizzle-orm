import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnType,
	HasGenerated,
} from '~/column-builder.ts';
import { ColumnBuilder } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { Simplify, Update } from '~/utils.ts';

import type { ForeignKey, UpdateDeleteAction } from '~/gel-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/gel-core/foreign-keys.ts';
import type { AnyGelTable, GelTable } from '~/gel-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import { iife } from '~/tracing-utils.ts';
import type { GelIndexOpClass } from '../indexes.ts';

export type GelColumns = Record<string, GelColumn<any>>;

export interface ReferenceConfig {
	ref: () => GelColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class GelColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnType> = ColumnBuilderBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TExtraConfig> {
	private foreignKeyConfigs: ReferenceConfig[] = [];

	static override readonly [entityKind]: string = 'GelColumnBuilder';

	array(length?: number): GelArrayBuilder<
		& {
			name: string;
			dataType: 'array basecolumn';
			data: T['data'][];
			driverParam: T['driverParam'][] | string;
			baseBuilder: T;
		}
		& (T extends { notNull: true } ? { notNull: true } : {})
		& (T extends { hasDefault: true } ? { hasDefault: true } : {}),
		T
	> {
		return new GelArrayBuilder(this.config.name, this as GelColumnBuilder<any, any>, length as any);
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
	buildForeignKeys(column: GelColumn, table: GelTable): ForeignKey[] {
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
	abstract build(table: GelTable): GelColumn<any>;

	/** @internal */
	buildExtraConfigColumn<TTableName extends string>(
		table: AnyGelTable<{ name: TTableName }>,
	): GelExtraConfigColumn {
		return new GelExtraConfigColumn(table, this.config);
	}
}

// To understand how to use `GelColumn` and `GelColumn`, see `Column` and `AnyColumn` documentation.
export abstract class GelColumn<
	T extends ColumnBaseConfig<ColumnType> = ColumnBaseConfig<ColumnType>,
	TRuntimeConfig extends object = {},
> extends Column<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'GelColumn';

	/** @internal */
	override readonly table: GelTable;

	constructor(
		table: GelTable,
		config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig,
	) {
		super(table, config);
		this.table = table;
	}
}

export type IndexedExtraConfigType = { order?: 'asc' | 'desc'; nulls?: 'first' | 'last'; opClass?: string };

export class GelExtraConfigColumn<
	T extends ColumnBaseConfig<ColumnType> = ColumnBaseConfig<ColumnType>,
> extends GelColumn<T, IndexedExtraConfigType> {
	static override readonly [entityKind]: string = 'GelExtraConfigColumn';

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
	 * If you have the `Gel_vector` extension installed in your database, you can use the
	 * `vector_l2_ops`, `vector_ip_ops`, `vector_cosine_ops`, `vector_l1_ops`, `bit_hamming_ops`, `bit_jaccard_ops`, `halfvec_l2_ops`, `sparsevec_l2_ops` options, which are predefined types.
	 *
	 * **You can always specify any string you want in the operator class, in case Drizzle doesn't have it natively in its types**
	 *
	 * @param opClass
	 * @returns
	 */
	op(opClass: GelIndexOpClass): Omit<this, 'op'> {
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

export type AnyGelColumn<TPartial extends Partial<ColumnBaseConfig<ColumnType>> = {}> = GelColumn<
	Required<Update<ColumnBaseConfig<ColumnType>, TPartial>>
>;

export type GelArrayColumnBuilderBaseConfig = ColumnBuilderBaseConfig<'array basecolumn'> & {
	baseBuilder: ColumnBuilderBaseConfig<ColumnType>;
};

export class GelArrayBuilder<
	T extends GelArrayColumnBuilderBaseConfig,
	TBase extends ColumnBuilderBaseConfig<ColumnType> | GelArrayColumnBuilderBaseConfig,
> extends GelColumnBuilder<
	T & {
		baseBuilder: TBase extends GelArrayColumnBuilderBaseConfig ? GelArrayBuilder<
				TBase,
				TBase extends { baseBuilder: infer TBaseBuilder extends ColumnBuilderBaseConfig<any> } ? TBaseBuilder
					: never
			>
			: GelColumnBuilder<TBase, {}, Simplify<Omit<TBase, keyof ColumnBuilderBaseConfig<any>>>>;
	},
	{
		baseBuilder: TBase extends GelArrayColumnBuilderBaseConfig ? GelArrayBuilder<
				TBase,
				TBase extends { baseBuilder: infer TBaseBuilder extends ColumnBuilderBaseConfig<any> } ? TBaseBuilder
					: never
			>
			: GelColumnBuilder<TBase, {}, Simplify<Omit<TBase, keyof ColumnBuilderBaseConfig<any>>>>;
		length: number | undefined;
	},
	{}
> {
	static override readonly [entityKind]: string = 'GelArrayBuilder';

	constructor(
		name: string,
		baseBuilder: GelArrayBuilder<T, TBase>['config']['baseBuilder'],
		length: number | undefined,
	) {
		super(name, 'array basecolumn', 'GelArray');
		this.config.baseBuilder = baseBuilder;
		this.config.length = length;
	}

	/** @internal */
	override build(table: GelTable) {
		const baseColumn: any = this.config.baseBuilder.build(table);
		return new GelArray(
			table,
			this.config as any,
			baseColumn,
		);
	}
}

export class GelArray<
	T extends ColumnBaseConfig<'array basecolumn'> & {
		length: number | undefined;
		baseBuilder: ColumnBuilderBaseConfig<ColumnType>;
	},
	TBase extends ColumnBuilderBaseConfig<ColumnType>,
> extends GelColumn<T, {}> {
	static override readonly [entityKind]: string = 'GelArray';

	constructor(
		table: AnyGelTable<{ name: T['tableName'] }>,
		config: GelArrayBuilder<T, TBase>['config'],
		readonly baseColumn: GelColumn,
		readonly range?: [number | undefined, number | undefined],
	) {
		super(table, config);
	}

	override mapFromDriverValue(value: unknown[]): T['data'] {
		return value.map((v) => this.baseColumn.mapFromDriverValue(v));
	}

	// Needed for arrays of custom types
	mapFromJsonValue(value: unknown[]): T['data'] {
		const base = this.baseColumn;

		return 'mapFromJsonValue' in base
			? value.map((v) => (<(value: unknown) => unknown> base.mapFromJsonValue)(v))
			: value.map((v) => base.mapFromDriverValue(v));
	}

	getSQLType(): string {
		return `${this.baseColumn.getSQLType()}[${typeof this.length === 'number' ? this.length : ''}]`;
	}
}
