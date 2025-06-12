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

import type { ForeignKey, UpdateDeleteAction } from '~/cockroach-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/cockroach-core/foreign-keys.ts';
import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import { iife } from '~/tracing-utils.ts';
import { makeCockroachArray, parseCockroachArray } from '../utils/array.ts';

export interface ReferenceConfig {
	ref: () => CockroachColumn;
	config: {
		name?: string;
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export interface CockroachColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> extends ColumnBuilderBase<T, TTypeConfig & { dialect: 'cockroach' }> {}

export abstract class CockroachColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'cockroach' }, TExtraConfig>
	implements CockroachColumnBuilderBase<T, TTypeConfig>
{
	private foreignKeyConfigs: ReferenceConfig[] = [];

	static override readonly [entityKind]: string = 'CockroachColumnBuilder';

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
	buildForeignKeys(column: CockroachColumn, table: CockroachTable): ForeignKey[] {
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
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachColumn<MakeColumnConfig<T, TTableName>>;

	/** @internal */
	buildExtraConfigColumn<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): ExtraConfigColumn {
		return new ExtraConfigColumn(table, this.config);
	}
}

export abstract class CockroachColumnWithArrayBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends CockroachColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'cockroach' }, TExtraConfig> {
	static override readonly [entityKind]: string = 'CockroachColumnWithArrayBuilder';
	array<TSize extends number | undefined = undefined>(size?: TSize): Omit<
		CockroachArrayBuilder<
			& {
				name: T['name'];
				dataType: 'array';
				columnType: 'CockroachArray';
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
		return new CockroachArrayBuilder(
			this.config.name,
			this as CockroachColumnWithArrayBuilder<any, any>,
			size as any,
		) as any; // size as any
	}
}

// To understand how to use `CockroachColumn` and `AnyCockroachColumn`, see `Column` and `AnyColumn` documentation.
export abstract class CockroachColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig, TTypeConfig & { dialect: 'cockroach' }> {
	static override readonly [entityKind]: string = 'CockroachColumn';

	constructor(
		override readonly table: CockroachTable,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		super(table, config);
	}

	/** @internal */
	override shouldDisableInsert(): boolean {
		return (this.config.generatedIdentity !== undefined && this.config.generatedIdentity.type === 'always')
			|| (this.config.generated !== undefined && this.config.generated.type !== 'byDefault');
	}
}

export type IndexedExtraConfigType = { order?: 'asc' | 'desc' };

export class ExtraConfigColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
> extends CockroachColumn<T, IndexedExtraConfigType> {
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

export type AnyCockroachColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> =
	CockroachColumn<
		Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
	>;

export type CockroachArrayColumnBuilderBaseConfig = ColumnBuilderBaseConfig<'array', 'CockroachArray'> & {
	size: number | undefined;
	baseBuilder: ColumnBuilderBaseConfig<ColumnDataType, string>;
};

export class CockroachArrayBuilder<
	T extends CockroachArrayColumnBuilderBaseConfig,
	TBase extends ColumnBuilderBaseConfig<ColumnDataType, string> | CockroachArrayColumnBuilderBaseConfig,
> extends CockroachColumnWithArrayBuilder<
	T,
	{
		baseBuilder: TBase extends CockroachArrayColumnBuilderBaseConfig ? CockroachArrayBuilder<
				TBase,
				TBase extends { baseBuilder: infer TBaseBuilder extends ColumnBuilderBaseConfig<any, any> } ? TBaseBuilder
					: never
			>
			: CockroachColumnWithArrayBuilder<TBase, {}, Simplify<Omit<TBase, keyof ColumnBuilderBaseConfig<any, any>>>>;
		size: T['size'];
	},
	{
		baseBuilder: TBase extends CockroachArrayColumnBuilderBaseConfig ? CockroachArrayBuilder<
				TBase,
				TBase extends { baseBuilder: infer TBaseBuilder extends ColumnBuilderBaseConfig<any, any> } ? TBaseBuilder
					: never
			>
			: CockroachColumnWithArrayBuilder<TBase, {}, Simplify<Omit<TBase, keyof ColumnBuilderBaseConfig<any, any>>>>;
		size: T['size'];
	}
> {
	static override readonly [entityKind] = 'CockroachArrayBuilder';

	constructor(
		name: string,
		baseBuilder: CockroachArrayBuilder<T, TBase>['config']['baseBuilder'],
		size: T['size'],
	) {
		super(name, 'array', 'CockroachArray');
		this.config.baseBuilder = baseBuilder;
		this.config.size = size;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachArray<MakeColumnConfig<T, TTableName> & { size: T['size']; baseBuilder: T['baseBuilder'] }, TBase> {
		const baseColumn = this.config.baseBuilder.build(table);
		return new CockroachArray<
			MakeColumnConfig<T, TTableName> & { size: T['size']; baseBuilder: T['baseBuilder'] },
			TBase
		>(
			table as AnyCockroachTable<{ name: MakeColumnConfig<T, TTableName>['tableName'] }>,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			baseColumn,
		);
	}
}

export class CockroachArray<
	T extends ColumnBaseConfig<'array', 'CockroachArray'> & {
		size: number | undefined;
		baseBuilder: ColumnBuilderBaseConfig<ColumnDataType, string>;
	},
	TBase extends ColumnBuilderBaseConfig<ColumnDataType, string>,
> extends CockroachColumn<T, {}, { size: T['size']; baseBuilder: T['baseBuilder'] }> {
	readonly size: T['size'];

	static override readonly [entityKind]: string = 'CockroachArray';

	constructor(
		table: AnyCockroachTable<{ name: T['tableName'] }>,
		config: CockroachArrayBuilder<T, TBase>['config'],
		readonly baseColumn: CockroachColumn,
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
			value = parseCockroachArray(value);
		}
		return value.map((v) => this.baseColumn.mapFromDriverValue(v));
	}

	override mapToDriverValue(value: unknown[], isNestedArray = false): unknown[] | string {
		const a = value.map((v) =>
			v === null
				? null
				: is(this.baseColumn, CockroachArray)
				? this.baseColumn.mapToDriverValue(v as unknown[], true)
				: this.baseColumn.mapToDriverValue(v)
		);
		if (isNestedArray) return a;
		return makeCockroachArray(a);
	}
}
