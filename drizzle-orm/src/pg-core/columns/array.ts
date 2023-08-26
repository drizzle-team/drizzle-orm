import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { makePgArray, parsePgArray } from '../utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

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
