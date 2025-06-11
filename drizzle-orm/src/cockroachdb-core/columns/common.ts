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

import type { ForeignKey, UpdateDeleteAction } from '~/cockroachdb-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/cockroachdb-core/foreign-keys.ts';
import type { AnyCockroachDbTable, CockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import { iife } from '~/tracing-utils.ts';
import { makeCockroachDbArray, parseCockroachDbArray } from '../utils/array.ts';

export interface ReferenceConfig {
	ref: () => CockroachDbColumn;
	config: {
		name?: string;
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export interface CockroachDbColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> extends ColumnBuilderBase<T, TTypeConfig & { dialect: 'cockroachdb' }> {}

export abstract class CockroachDbColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'cockroachdb' }, TExtraConfig>
	implements CockroachDbColumnBuilderBase<T, TTypeConfig>
{
	private foreignKeyConfigs: ReferenceConfig[] = [];

	static override readonly [entityKind]: string = 'CockroachDbColumnBuilder';

	references(
		ref: ReferenceConfig['ref'],
		config: ReferenceConfig['config'] = {},
	): this {
		this.foreignKeyConfigs.push({ ref, config });
		return this;
	}

	unique(
		name?: string,
	): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		this.config.uniqueNameExplicit = name ? true : false;
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
	buildForeignKeys(column: CockroachDbColumn, table: CockroachDbTable): ForeignKey[] {
		return this.foreignKeyConfigs.map(({ ref, config }) => {
			return iife(
				(ref, config) => {
					const builder = new ForeignKeyBuilder(() => {
						const foreignColumn = ref();
						return { name: config.name, columns: [column], foreignColumns: [foreignColumn] };
					});
					if (config.onUpdate) {
						builder.onUpdate(config.onUpdate);
					}
					if (config.onDelete) {
						builder.onDelete(config.onDelete);
					}
					return builder.build(table);
				},
				ref,
				config,
			);
		});
	}

	/** @internal */
	abstract build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbColumn<MakeColumnConfig<T, TTableName>>;

	/** @internal */
	buildExtraConfigColumn<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): ExtraConfigColumn {
		return new ExtraConfigColumn(table, this.config);
	}
}

export abstract class CockroachDbColumnWithArrayBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends CockroachDbColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'cockroachdb' }, TExtraConfig> {
	static override readonly [entityKind]: string = 'CockroachDbColumnWithArrayBuilder';
	array<TSize extends number | undefined = undefined>(size?: TSize): Omit<
		CockroachDbArrayBuilder<
			& {
				name: T['name'];
				dataType: 'array';
				columnType: 'CockroachDbArray';
				data: T['data'][];
				driverParam: T['driverParam'][] | string;
				enumValues: T['enumValues'];
				size: TSize;
				baseBuilder: T;
			}
			& (T extends { notNull: true } ? { notNull: true } : {})
			& (T extends { hasDefault: true } ? { hasDefault: true } : {}),
			T
		>,
		'array'
	> {
		return new CockroachDbArrayBuilder(
			this.config.name,
			this as CockroachDbColumnWithArrayBuilder<any, any>,
			size as any,
		) as any; // size as any
	}
}

// To understand how to use `CockroachDbColumn` and `CockroachDbColumn`, see `Column` and `AnyColumn` documentation.
export abstract class CockroachDbColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig, TTypeConfig & { dialect: 'cockroachdb' }> {
	static override readonly [entityKind]: string = 'CockroachDbColumn';

	constructor(
		override readonly table: CockroachDbTable,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		super(table, config);
	}

	/** @internal */
	override shouldDisableInsert(): boolean {
		// return (this.config.generatedIdentity !== undefined && this.config.generatedIdentity.type === 'always')
		// 	|| (this.config.generated !== undefined && this.config.generated.type !== 'byDefault');
		return this.config.generated !== undefined && this.config.generated.type !== 'byDefault';
	}
}

export type IndexedExtraConfigType = { order?: 'asc' | 'desc' };

export class ExtraConfigColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
> extends CockroachDbColumn<T, IndexedExtraConfigType> {
	static override readonly [entityKind]: string = 'ExtraConfigColumn';

	override getSQLType(): string {
		return this.getSQLType();
	}

	indexConfig: IndexedExtraConfigType = {
		order: this.config.order ?? 'asc',
	};
	defaultConfig: IndexedExtraConfigType = {
		order: 'asc',
	};

	asc(): Omit<this, 'asc' | 'desc'> {
		this.indexConfig.order = 'asc';
		return this;
	}

	desc(): Omit<this, 'asc' | 'desc'> {
		this.indexConfig.order = 'desc';
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

export type AnyCockroachDbColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> =
	CockroachDbColumn<
		Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
	>;

export type CockroachDbArrayColumnBuilderBaseConfig = ColumnBuilderBaseConfig<'array', 'CockroachDbArray'> & {
	size: number | undefined;
	baseBuilder: ColumnBuilderBaseConfig<ColumnDataType, string>;
};

export class CockroachDbArrayBuilder<
	T extends CockroachDbArrayColumnBuilderBaseConfig,
	TBase extends ColumnBuilderBaseConfig<ColumnDataType, string> | CockroachDbArrayColumnBuilderBaseConfig,
> extends CockroachDbColumnWithArrayBuilder<
	T,
	{
		baseBuilder: TBase extends CockroachDbArrayColumnBuilderBaseConfig ? CockroachDbArrayBuilder<
				TBase,
				TBase extends { baseBuilder: infer TBaseBuilder extends ColumnBuilderBaseConfig<any, any> } ? TBaseBuilder
					: never
			>
			: CockroachDbColumnWithArrayBuilder<TBase, {}, Simplify<Omit<TBase, keyof ColumnBuilderBaseConfig<any, any>>>>;
		size: T['size'];
	},
	{
		baseBuilder: TBase extends CockroachDbArrayColumnBuilderBaseConfig ? CockroachDbArrayBuilder<
				TBase,
				TBase extends { baseBuilder: infer TBaseBuilder extends ColumnBuilderBaseConfig<any, any> } ? TBaseBuilder
					: never
			>
			: CockroachDbColumnWithArrayBuilder<TBase, {}, Simplify<Omit<TBase, keyof ColumnBuilderBaseConfig<any, any>>>>;
		size: T['size'];
	}
> {
	static override readonly [entityKind] = 'CockroachDbArrayBuilder';

	constructor(
		name: string,
		baseBuilder: CockroachDbArrayBuilder<T, TBase>['config']['baseBuilder'],
		size: T['size'],
	) {
		super(name, 'array', 'CockroachDbArray');
		this.config.baseBuilder = baseBuilder;
		this.config.size = size;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbArray<MakeColumnConfig<T, TTableName> & { size: T['size']; baseBuilder: T['baseBuilder'] }, TBase> {
		const baseColumn = this.config.baseBuilder.build(table);
		return new CockroachDbArray<
			MakeColumnConfig<T, TTableName> & { size: T['size']; baseBuilder: T['baseBuilder'] },
			TBase
		>(
			table as AnyCockroachDbTable<{ name: MakeColumnConfig<T, TTableName>['tableName'] }>,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			baseColumn,
		);
	}
}

export class CockroachDbArray<
	T extends ColumnBaseConfig<'array', 'CockroachDbArray'> & {
		size: number | undefined;
		baseBuilder: ColumnBuilderBaseConfig<ColumnDataType, string>;
	},
	TBase extends ColumnBuilderBaseConfig<ColumnDataType, string>,
> extends CockroachDbColumn<T, {}, { size: T['size']; baseBuilder: T['baseBuilder'] }> {
	readonly size: T['size'];

	static override readonly [entityKind]: string = 'CockroachDbArray';

	constructor(
		table: AnyCockroachDbTable<{ name: T['tableName'] }>,
		config: CockroachDbArrayBuilder<T, TBase>['config'],
		readonly baseColumn: CockroachDbColumn,
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
			value = parseCockroachDbArray(value);
		}
		return value.map((v) => this.baseColumn.mapFromDriverValue(v));
	}

	override mapToDriverValue(value: unknown[], isNestedArray = false): unknown[] | string {
		const a = value.map((v) =>
			v === null
				? null
				: is(this.baseColumn, CockroachDbArray)
				? this.baseColumn.mapToDriverValue(v as unknown[], true)
				: this.baseColumn.mapToDriverValue(v)
		);
		if (isNestedArray) return a;
		return makeCockroachDbArray(a);
	}
}
