import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgCharBuilder<TEnum extends [string, ...string[]], TLength extends number | undefined>
	extends PgColumnBuilder<{
		name: string;
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string char' : 'enum';
		data: TEnum[number];
		enumValues: TEnum;
		driverParam: string;
		length: TLength;
	}, { length: TLength; enumValues: TEnum }>
{
	static override readonly [entityKind]: string = 'PgCharBuilder';

	constructor(name: string, config: PgCharConfig<TEnum>) {
		super(name, config.enum?.length ? 'enum' : 'string char', 'PgChar');
		this.config.length = config.length as TLength;
		this.config.enumValues = config.enum as TEnum;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgChar(
			table,
			this.config as any,
		);
	}
}

export class PgChar<T extends ColumnBaseConfig<'string char' | 'enum'> & { length?: number | undefined }>
	extends PgColumn<T, { length: T['length']; enumValues: T['enumValues'] }>
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

export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config?: PgCharConfig<T | Writable<T>, L>,
): PgCharBuilder<Writable<T>, L>;
export function char<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: string,
	config?: PgCharConfig<T | Writable<T>, L>,
): PgCharBuilder<Writable<T>, L>;
export function char(a?: string | PgCharConfig, b: PgCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<PgCharConfig>(a, b);
	return new PgCharBuilder(name, config as any);
}
