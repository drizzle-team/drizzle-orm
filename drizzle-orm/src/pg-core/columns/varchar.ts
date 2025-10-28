import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgVarcharBuilder<
	TEnum extends [string, ...string[]],
> extends PgColumnBuilder<
	{
		name: string;
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
	},
	{ length: number | undefined; enumValues: TEnum }
> {
	static override readonly [entityKind]: string = 'PgVarcharBuilder';

	constructor(name: string, config: PgVarcharConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'PgVarchar');
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

export class PgVarchar<T extends ColumnBaseConfig<'string' | 'string enum'>>
	extends PgColumn<T, { length: number | undefined; enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'PgVarchar';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface PgVarcharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
	length?: number;
}

export function varchar(): PgVarcharBuilder<[string, ...string[]]>;
export function varchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	config?: PgVarcharConfig<T | Writable<T>>,
): PgVarcharBuilder<Writable<T>>;
export function varchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: string,
	config?: PgVarcharConfig<T | Writable<T>>,
): PgVarcharBuilder<Writable<T>>;
export function varchar(a?: string | PgVarcharConfig, b: PgVarcharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<PgVarcharConfig>(a, b);
	return new PgVarcharBuilder(name, config as any);
}
