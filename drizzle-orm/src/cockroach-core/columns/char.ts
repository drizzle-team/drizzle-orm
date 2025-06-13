import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachCharBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = CockroachCharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachChar';
	data: TEnum[number];
	enumValues: TEnum;
	driverParam: string;
	length: TLength;
}>;

export class CockroachCharBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachChar'> & { length?: number | undefined },
> extends CockroachColumnWithArrayBuilder<
	T,
	{ length: T['length']; enumValues: T['enumValues'] },
	{ length: T['length'] }
> {
	static override readonly [entityKind]: string = 'CockroachCharBuilder';

	constructor(name: T['name'], config: CockroachCharConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'CockroachChar');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachChar<MakeColumnConfig<T, TTableName> & { length: T['length'] }> {
		return new CockroachChar<MakeColumnConfig<T, TTableName> & { length: T['length'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachChar<T extends ColumnBaseConfig<'string', 'CockroachChar'> & { length?: number | undefined }>
	extends CockroachColumn<T, { length: T['length']; enumValues: T['enumValues'] }, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'CockroachChar';

	readonly length = this.config.length;
	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface CockroachCharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function char(): CockroachCharBuilderInitial<'', [string, ...string[]], undefined>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config?: CockroachCharConfig<T | Writable<T>, L>,
): CockroachCharBuilderInitial<'', Writable<T>, L>;
export function char<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config?: CockroachCharConfig<T | Writable<T>, L>,
): CockroachCharBuilderInitial<TName, Writable<T>, L>;
export function char(a?: string | CockroachCharConfig, b: CockroachCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<CockroachCharConfig>(a, b);
	return new CockroachCharBuilder(name, config as any);
}
