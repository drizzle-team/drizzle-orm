import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from './common.ts';

export type CockroachDbCharBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = CockroachDbCharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachDbChar';
	data: TEnum[number];
	enumValues: TEnum;
	driverParam: string;
	length: TLength;
}>;

export class CockroachDbCharBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachDbChar'> & { length?: number | undefined },
> extends CockroachDbColumnWithArrayBuilder<
	T,
	{ length: T['length']; enumValues: T['enumValues'] },
	{ length: T['length'] }
> {
	static override readonly [entityKind]: string = 'CockroachDbCharBuilder';

	constructor(name: T['name'], config: CockroachDbCharConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'CockroachDbChar');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbChar<MakeColumnConfig<T, TTableName> & { length: T['length'] }> {
		return new CockroachDbChar<MakeColumnConfig<T, TTableName> & { length: T['length'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbChar<T extends ColumnBaseConfig<'string', 'CockroachDbChar'> & { length?: number | undefined }>
	extends CockroachDbColumn<T, { length: T['length']; enumValues: T['enumValues'] }, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'CockroachDbChar';

	readonly length = this.config.length;
	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface CockroachDbCharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function char(): CockroachDbCharBuilderInitial<'', [string, ...string[]], undefined>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config?: CockroachDbCharConfig<T | Writable<T>, L>,
): CockroachDbCharBuilderInitial<'', Writable<T>, L>;
export function char<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config?: CockroachDbCharConfig<T | Writable<T>, L>,
): CockroachDbCharBuilderInitial<TName, Writable<T>, L>;
export function char(a?: string | CockroachDbCharConfig, b: CockroachDbCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<CockroachDbCharConfig>(a, b);
	return new CockroachDbCharBuilder(name, config as any);
}
