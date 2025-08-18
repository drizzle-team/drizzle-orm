import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgVarcharBuilder<
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> extends PgColumnBuilder<
	{
		name: string;
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string varchar' : 'string enum';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
		length: TLength;
	},
	{ length: TLength; enumValues: TEnum }
> {
	static override readonly [entityKind]: string = 'PgVarcharBuilder';

	constructor(name: string, config: PgVarcharConfig<TEnum, TLength>) {
		super(name, config.enum?.length ? 'string enum' : 'string varchar', 'PgVarchar');
		this.config.length = config.length!;
		this.config.enumValues = config.enum!;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgVarchar(
			table,
			this.config as any,
		);
	}
}

export class PgVarchar<T extends ColumnBaseConfig<'string varchar' | 'string enum'> & { length?: number | undefined }>
	extends PgColumn<T, { length: T['length']; enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'PgVarchar';

	readonly length = this.config.length;
	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface PgVarcharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function varchar(): PgVarcharBuilder<[string, ...string[]], undefined>;
export function varchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	config?: PgVarcharConfig<T | Writable<T>, L>,
): PgVarcharBuilder<Writable<T>, L>;
export function varchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: string,
	config?: PgVarcharConfig<T | Writable<T>, L>,
): PgVarcharBuilder<Writable<T>, L>;
export function varchar(a?: string | PgVarcharConfig, b: PgVarcharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<PgVarcharConfig>(a, b);
	return new PgVarcharBuilder(name, config as any);
}
