import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import type { PgTable } from '../table.ts';
import { PgColumn } from './common.ts';
import { PgIntColumnBaseBuilder } from './int.common.ts';

export class PgIntegerBuilder<TEnum extends [number, ...number[]] = [number, ...number[]]>
	extends PgIntColumnBaseBuilder<{
		dataType: 'number int32';
		data: TEnum[number];
		enumValues: TEnum;
		driverParam: number | string;
	}, { enumValues: TEnum | undefined }>
{
	static override readonly [entityKind]: string = 'PgIntegerBuilder';

	constructor(name: string, config: PgIntegerConfig<TEnum>) {
		super(name, 'number int32', 'PgInteger');
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgInteger(table, this.config as any, this.config.enumValues);
	}
}

export class PgInteger<T extends ColumnBaseConfig<'number int32'>>
	extends PgColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'PgInteger';
	override readonly enumValues;

	constructor(
		table: PgTable<any>,
		config: any,
		enumValues?: number[],
	) {
		super(table, config);
		this.enumValues = enumValues;
	}

	getSQLType(): string {
		return 'integer';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number.parseInt(value);
		}
		return value;
	}
}

export interface PgIntegerConfig<
	TEnum extends readonly number[] | undefined = readonly number[] | undefined,
> {
	enum?: TEnum;
}

export function integer<U extends number, T extends Readonly<[U, ...U[]]>>(
	config?: PgIntegerConfig<T | Writable<T>>,
): PgIntegerBuilder<Writable<T>>;
export function integer<U extends number, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: PgIntegerConfig<T | Writable<T>>,
): PgIntegerBuilder<Writable<T>>;
export function integer(a?: string | PgIntegerConfig, b: PgIntegerConfig = {}): PgIntegerBuilder {
	const { name, config } = getColumnNameAndConfig<PgIntegerConfig>(a, b);
	return new PgIntegerBuilder(name, config as any);
}
