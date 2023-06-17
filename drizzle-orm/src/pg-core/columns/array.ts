import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type {
	AnyColumnBuilder,
	BuildColumn,
	ColumnBuilderBaseConfig,
	ColumnBuilderHKTBase,
	MakeColumnConfig,
} from '~/column-builder';
import { entityKind, is } from '~/entity';
import type { AnyPgTable } from '~/pg-core/table';
import { type Assume } from '~/utils';
import { makePgArray, parsePgArray } from '../utils';
import { type AnyPgColumn, PgColumn, PgColumnBuilder, type PgColumnBuilderHKT } from './common';

export interface PgArrayBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgArrayBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgArrayHKT;
}

export interface PgArrayHKT extends ColumnHKTBase {
	_type: PgArray<Assume<this['config'], ColumnBaseConfig>>;
}

export class PgArrayBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<
	PgArrayBuilderHKT,
	T,
	{
		baseBuilder: PgColumnBuilder<
			PgColumnBuilderHKT,
			{
				name: T['name'];
				notNull: T['notNull'];
				hasDefault: T['hasDefault'];
				data: Assume<T['data'], unknown[]>[number];
				driverParam: string | Assume<T['driverParam'], unknown[]>[number];
			}
		>;
		size: number | undefined;
	}
> {
	static override readonly [entityKind] = 'PgArrayBuilder';

	constructor(
		name: string,
		baseBuilder: PgArrayBuilder<T>['config']['baseBuilder'],
		size: number | undefined,
	) {
		super(name);
		this.config.baseBuilder = baseBuilder;
		this.config.size = size;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgArray<MakeColumnConfig<T, TTableName>> {
		const baseColumn = this.config.baseBuilder.build(table);
		return new PgArray<MakeColumnConfig<T, TTableName>>(table, this.config, baseColumn);
	}
}

export class PgArray<T extends ColumnBaseConfig> extends PgColumn<PgArrayHKT, T, {}, {
	baseColumn: BuildColumn<
		string,
		Assume<
			PgColumnBuilder<
				PgColumnBuilderHKT,
				{
					name: T['name'];
					notNull: T['notNull'];
					hasDefault: T['hasDefault'];
					data: Assume<T['data'], unknown[]>[number];
					driverParam: string | Assume<T['driverParam'], unknown[]>[number];
				}
			>,
			AnyColumnBuilder
		>
	>;
}> {
	declare protected $pgColumnBrand: 'PgArray';

	readonly size: number | undefined;

	static readonly [entityKind]: string = 'PgArray';

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgArrayBuilder<T>['config'],
		readonly baseColumn: AnyPgColumn,
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
