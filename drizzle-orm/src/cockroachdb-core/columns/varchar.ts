import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from './common.ts';

export type CockroachDbVarcharBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = CockroachDbVarcharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachDbVarchar';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
	length: TLength;
}>;

export class CockroachDbVarcharBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachDbVarchar'> & { length?: number | undefined },
> extends CockroachDbColumnWithArrayBuilder<
	T,
	{ length: T['length']; enumValues: T['enumValues'] },
	{ length: T['length'] }
> {
	static override readonly [entityKind]: string = 'CockroachDbVarcharBuilder';

	constructor(name: T['name'], config: CockroachDbVarcharConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'CockroachDbVarchar');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbVarchar<MakeColumnConfig<T, TTableName> & { length: T['length'] }> {
		return new CockroachDbVarchar<MakeColumnConfig<T, TTableName> & { length: T['length'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbVarchar<
	T extends ColumnBaseConfig<'string', 'CockroachDbVarchar'> & { length?: number | undefined },
> extends CockroachDbColumn<T, { length: T['length']; enumValues: T['enumValues'] }, { length: T['length'] }> {
	static override readonly [entityKind]: string = 'CockroachDbVarchar';

	readonly length = this.config.length;
	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface CockroachDbVarcharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function varchar(): CockroachDbVarcharBuilderInitial<'', [string, ...string[]], undefined>;
export function varchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	config?: CockroachDbVarcharConfig<T | Writable<T>, L>,
): CockroachDbVarcharBuilderInitial<'', Writable<T>, L>;
export function varchar<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config?: CockroachDbVarcharConfig<T | Writable<T>, L>,
): CockroachDbVarcharBuilderInitial<TName, Writable<T>, L>;
export function varchar(a?: string | CockroachDbVarcharConfig, b: CockroachDbVarcharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<CockroachDbVarcharConfig>(a, b);
	return new CockroachDbVarcharBuilder(name, config as any);
}
