import type {
	ColumnBuilderBase,
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	MakeColumnConfig,
} from '~/column-builder.ts';
import { ColumnBuilder } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { Update } from '~/utils.ts';

import type { ForeignKey, UpdateDeleteAction } from '~/pg-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/pg-core/foreign-keys.ts';
import type { AnyPgTable, PgTable } from '~/pg-core/table.ts';
import { iife } from '~/tracing-utils.ts';
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

	static readonly [entityKind]: string = 'PgColumnBuilder';

	array(size?: number): PgArrayBuilder<
		& {
			name: T['name'];
			dataType: 'array';
			columnType: 'PgArray';
			data: T['data'][];
			driverParam: T['driverParam'][] | string;
			enumValues: T['enumValues'];
			generated: undefined;
		}
		& (T extends { notNull: true } ? { notNull: true } : {})
		& (T extends { hasDefault: true } ? { hasDefault: true } : {}),
		T
	> {
		return new PgArrayBuilder(this.config.name, this as PgColumnBuilder<any, any>, size);
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
}

// To understand how to use `PgColumn` and `PgColumn`, see `Column` and `AnyColumn` documentation.
export abstract class PgColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig, TTypeConfig & { dialect: 'pg' }> {
	static readonly [entityKind]: string = 'PgColumn';

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

export type AnyPgColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> = PgColumn<
	Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
>;

export class PgArrayBuilder<
	T extends ColumnBuilderBaseConfig<'array', 'PgArray'>,
	TBase extends ColumnBuilderBaseConfig<ColumnDataType, string>,
> extends PgColumnBuilder<
	T,
	{
		baseBuilder: PgColumnBuilder<TBase>;
		size: number | undefined;
	},
	{
		baseBuilder: PgColumnBuilder<TBase>;
	}
> {
	static override readonly [entityKind] = 'PgArrayBuilder';

	constructor(
		name: string,
		baseBuilder: PgArrayBuilder<T, TBase>['config']['baseBuilder'],
		size: number | undefined,
	) {
		super(name, 'array', 'PgArray');
		this.config.baseBuilder = baseBuilder;
		this.config.size = size;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgArray<MakeColumnConfig<T, TTableName>, TBase> {
		const baseColumn = this.config.baseBuilder.build(table);
		return new PgArray<MakeColumnConfig<T, TTableName>, TBase>(
			table as AnyPgTable<{ name: MakeColumnConfig<T, TTableName>['tableName'] }>,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			baseColumn,
		);
	}
}

export class PgArray<
	T extends ColumnBaseConfig<'array', 'PgArray'>,
	TBase extends ColumnBuilderBaseConfig<ColumnDataType, string>,
> extends PgColumn<T> {
	readonly size: number | undefined;

	static readonly [entityKind]: string = 'PgArray';

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
