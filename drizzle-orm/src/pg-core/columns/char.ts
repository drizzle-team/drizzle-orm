import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgCharBuilder<
	TEnum extends [string, ...string[]],
> extends PgColumnBuilder<{
	dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
	data: TEnum[number];
	enumValues: TEnum;
	driverParam: string;
}, { enumValues?: TEnum; length: number; setLength: boolean }> {
	static override readonly [entityKind]: string = 'PgCharBuilder';

	constructor(name: string, config: PgCharConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'PgChar');
		this.config.length = config.length ?? 1;
		this.config.setLength = config.length !== undefined;
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

export class PgChar<T extends ColumnBaseConfig<'string' | 'string enum'>>
	extends PgColumn<T, { enumValues?: T['enumValues']; length: number; setLength: boolean }>
{
	static override readonly [entityKind]: string = 'PgChar';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.config.setLength ? `char(${this.length})` : `char`;
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
