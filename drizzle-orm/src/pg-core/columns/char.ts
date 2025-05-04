import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgCharBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = PgCharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgChar';
	data: TEnum[number];
	enumValues: TEnum;
	driverParam: string;
	length: TLength;
}>;

export class PgCharBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgChar'> & { length?: number | undefined }>
	extends PgColumnBuilder<
		T,
		{ length: T['length']; enumValues: T['enumValues'] },
		{ length: T['length'] }
	>
{
	static override readonly [entityKind]: string = 'PgCharBuilder';

	constructor(name: T['name'], config: PgCharConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'PgChar');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgChar<MakeColumnConfig<T, TTableName> & { length: T['length'] }> {
		return new PgChar<MakeColumnConfig<T, TTableName> & { length: T['length'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgChar<T extends ColumnBaseConfig<'string', 'PgChar'> & { length?: number | undefined }>
	extends PgColumn<T, { length: T['length']; enumValues: T['enumValues'] }, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'PgChar';

	readonly length = this.config.length;
	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface PgCharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function char(): PgCharBuilderInitial<'', [string, ...string[]], undefined>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config?: PgCharConfig<T | Writable<T>, L>,
): PgCharBuilderInitial<'', Writable<T>, L>;
export function char<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config?: PgCharConfig<T | Writable<T>, L>,
): PgCharBuilderInitial<TName, Writable<T>, L>;
export function char(a?: string | PgCharConfig, b: PgCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<PgCharConfig>(a, b);
	return new PgCharBuilder(name, config as any);
}
