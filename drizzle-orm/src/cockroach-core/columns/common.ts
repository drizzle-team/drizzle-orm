import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	ColumnType,
	HasGenerated,
} from '~/column-builder.ts';
import { ColumnBuilder } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { Update } from '~/utils.ts';

import type { ForeignKey, UpdateDeleteAction } from '~/cockroach-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/cockroach-core/foreign-keys.ts';
import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import { iife } from '~/tracing-utils.ts';
import { makeCockroachArray, parseCockroachArray } from '../utils/array.ts';

export type CockroachColumns = Record<string, CockroachColumn<any>>;

export interface ReferenceConfig {
	ref: () => CockroachColumn;
	config: {
		name?: string;
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}
export abstract class CockroachColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnType> = ColumnBuilderBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
> extends ColumnBuilder<T, TRuntimeConfig> {
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
	abstract build(table: CockroachTable): CockroachColumn<any>;

	/** @internal */
	buildExtraConfigColumn<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): ExtraConfigColumn {
		return new ExtraConfigColumn(table, this.config);
	}
}

export abstract class CockroachColumnWithArrayBuilder<
	T extends ColumnBuilderBaseConfig<ColumnType> = ColumnBuilderBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
> extends CockroachColumnBuilder<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'CockroachColumnWithArrayBuilder';
	array<TSize extends number | undefined = undefined>(size?: TSize): Omit<
		CockroachArrayBuilder<
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
	T extends ColumnBaseConfig<ColumnType> = ColumnBaseConfig<ColumnType>,
	TRuntimeConfig extends object = {},
> extends Column<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'CockroachColumn';

	/** @internal */
	override readonly table: CockroachTable;

	constructor(
		table: CockroachTable,
		config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig,
	) {
		super(table, config);
		this.table = table;
	}

	/** @internal */
	override shouldDisableInsert(): boolean {
		return (this.config.generatedIdentity !== undefined && this.config.generatedIdentity.type === 'always')
			|| (this.config.generated !== undefined && this.config.generated.type !== 'byDefault');
	}
}

export type IndexedExtraConfigType = { order?: 'asc' | 'desc' };

export class ExtraConfigColumn<
	T extends ColumnBaseConfig<ColumnType> = ColumnBaseConfig<ColumnType>,
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

export type AnyCockroachColumn<TPartial extends Partial<ColumnBaseConfig<ColumnType>> = {}> = CockroachColumn<
	Required<Update<ColumnBaseConfig<ColumnType>, TPartial>>
>;

export type CockroachArrayColumnBuilderBaseConfig = ColumnBuilderBaseConfig<'array basecolumn'> & {
	baseBuilder: ColumnBuilderBaseConfig<ColumnType>;
};

export class CockroachArrayBuilder<
	T extends CockroachArrayColumnBuilderBaseConfig,
	TBase extends ColumnBuilderBaseConfig<ColumnType> | CockroachArrayColumnBuilderBaseConfig,
> extends CockroachColumnWithArrayBuilder<
	T & {
		baseBuilder: TBase extends CockroachArrayColumnBuilderBaseConfig ? CockroachArrayBuilder<
				TBase,
				TBase extends { baseBuilder: infer TBaseBuilder extends ColumnBuilderBaseConfig<any> } ? TBaseBuilder
					: never
			>
			: CockroachColumnWithArrayBuilder<TBase, {}>;
	},
	{
		baseBuilder: TBase extends CockroachArrayColumnBuilderBaseConfig ? CockroachArrayBuilder<
				TBase,
				TBase extends { baseBuilder: infer TBaseBuilder extends ColumnBuilderBaseConfig<any> } ? TBaseBuilder
					: never
			>
			: CockroachColumnWithArrayBuilder<TBase, {}>;
		length: number | undefined;
	}
> {
	static override readonly [entityKind]: string = 'CockroachArrayBuilder';

	constructor(
		name: string,
		baseBuilder: CockroachArrayBuilder<T, TBase>['config']['baseBuilder'],
		length: number | undefined,
	) {
		super(name, 'array basecolumn', 'CockroachArray');
		this.config.baseBuilder = baseBuilder;
		this.config.length = length;
	}

	/** @internal */
	override build(table: CockroachTable) {
		const baseColumn: any = this.config.baseBuilder.build(table);
		return new CockroachArray(
			table,
			this.config as any,
			baseColumn,
		);
	}
}

export class CockroachArray<
	T extends ColumnBaseConfig<'array basecolumn'> & {
		length: number | undefined;
		baseBuilder: ColumnBuilderBaseConfig<ColumnType>;
	},
	TBase extends ColumnBuilderBaseConfig<ColumnType>,
> extends CockroachColumn<T, {}> {
	static override readonly [entityKind]: string = 'CockroachArray';

	constructor(
		table: CockroachTable<any>,
		config: CockroachArrayBuilder<T, TBase>['config'],
		readonly baseColumn: CockroachColumn,
		readonly range?: [number | undefined, number | undefined],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `${this.baseColumn.getSQLType()}[${typeof this.length === 'number' ? this.length : ''}]`;
	}

	override mapFromDriverValue(value: unknown[] | string): T['data'] {
		if (typeof value === 'string') {
			value = parseCockroachArray(value);
		}
		return value.map((v) => this.baseColumn.mapFromDriverValue(v));
	}

	// Needed for arrays of custom types
	mapFromJsonValue(value: unknown[] | string): T['data'] {
		if (typeof value === 'string') {
			// Thank you node-postgres for not parsing enum arrays
			value = parseCockroachArray(value);
		}

		const base = this.baseColumn;

		return 'mapFromJsonValue' in base
			? value.map((v) => (<(value: unknown) => unknown> base.mapFromJsonValue)(v))
			: value.map((v) => base.mapFromDriverValue(v));
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
