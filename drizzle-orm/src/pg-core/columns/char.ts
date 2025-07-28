import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgCharBuilder<TEnum extends [string, ...string[]]> extends PgColumnBuilder<{
	name: string;
	dataType: 'string';
	data: TEnum[number];
	enumValues: TEnum;
	driverParam: string;
}, { length?: number; enumValues?: TEnum }> {
	static override readonly [entityKind]: string = 'PgCharBuilder';

	constructor(name: string, config: PgCharConfig<TEnum>) {
		super(name, 'string', 'PgChar');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgChar(
			table,
			this.config as any,
		);
	}
}

export class PgChar<T extends ColumnBaseConfig<'string'> & { length?: number | undefined }>
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
> {
	enum?: TEnum;
	length?: number;
}

export function char<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: PgCharConfig<T | Writable<T>>,
): PgCharBuilder<Writable<T>>;
export function char<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: string,
	config?: PgCharConfig<T | Writable<T>>,
): PgCharBuilder<Writable<T>>;
export function char(a?: string | PgCharConfig, b: PgCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<PgCharConfig>(a, b);
	return new PgCharBuilder(name, config as any);
}
