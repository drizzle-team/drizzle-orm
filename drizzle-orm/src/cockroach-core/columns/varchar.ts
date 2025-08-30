import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachVarcharBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = CockroachVarcharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachVarchar';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
	length: TLength;
}>;

export class CockroachVarcharBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachVarchar'> & { length?: number | undefined },
> extends CockroachColumnWithArrayBuilder<
	T,
	{ length: T['length']; enumValues: T['enumValues'] },
	{ length: T['length'] }
> {
	static override readonly [entityKind]: string = 'CockroachVarcharBuilder';

	constructor(name: T['name'], config: CockroachVarcharConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'CockroachVarchar');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachVarchar<MakeColumnConfig<T, TTableName> & { length: T['length'] }> {
		return new CockroachVarchar<MakeColumnConfig<T, TTableName> & { length: T['length'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachVarchar<
	T extends ColumnBaseConfig<'string', 'CockroachVarchar'> & { length?: number | undefined },
> extends CockroachColumn<T, { length: T['length']; enumValues: T['enumValues'] }, { length: T['length'] }> {
	static override readonly [entityKind]: string = 'CockroachVarchar';

	readonly length = this.config.length;
	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface CockroachVarcharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function varchar(): CockroachVarcharBuilderInitial<'', [string, ...string[]], undefined>;
export function varchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	config?: CockroachVarcharConfig<T | Writable<T>, L>,
): CockroachVarcharBuilderInitial<'', Writable<T>, L>;
export function varchar<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config?: CockroachVarcharConfig<T | Writable<T>, L>,
): CockroachVarcharBuilderInitial<TName, Writable<T>, L>;
export function varchar(a?: string | CockroachVarcharConfig, b: CockroachVarcharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<CockroachVarcharConfig>(a, b);
	return new CockroachVarcharBuilder(name, config as any);
}
