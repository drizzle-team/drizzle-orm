import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

type PgCharBuilderConfig<TEnum extends [string, ...string[]]> = Equal<TEnum, [string, ...string[]]> extends true
	? { dataType: 'string'; data: string; driverParam: string }
	: { dataType: 'string enum'; data: TEnum[number]; enumValues: TEnum; driverParam: string };

export class PgCharBuilder<TEnum extends [string, ...string[]] = [string, ...string[]]> extends PgColumnBuilder<
	PgCharBuilderConfig<TEnum>,
	{ enumValues: TEnum; length: number; setLength: boolean }
> {
	static override readonly [entityKind]: string = 'PgCharBuilder';

	constructor(name: string, config: PgCharConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'PgChar');
		this.config.length = config.length ?? 1;
		this.config.setLength = config.length !== undefined;
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

export class PgChar<TEnum extends [string, ...string[]] = [string, ...string[]]>
	extends PgColumn<Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum'>
{
	static override readonly [entityKind]: string = 'PgChar';

	override readonly enumValues: TEnum;
	private readonly setLength: boolean;

	constructor(table: PgTable<any>, config: PgCharBuilder<TEnum>['config']) {
		super(table, config as any);
		this.enumValues = config.enumValues;
		this.setLength = config.setLength;
	}

	getSQLType(): string {
		return this.setLength ? `char(${this.length})` : `char`;
	}
}

export interface PgCharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
	length?: number;
}

export function char(): PgCharBuilder;
export function char(name: string): PgCharBuilder;
export function char(config: { length?: number }): PgCharBuilder;
export function char(name: string, config: { length?: number }): PgCharBuilder;
export function char<U extends string, T extends Readonly<[U, ...U[]]>>(
	config: PgCharConfig<T | Writable<T>> & { enum: T | Writable<T> },
): PgCharBuilder<Writable<T>>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config: PgCharConfig<T | Writable<T>> & { enum: T | Writable<T> },
): PgCharBuilder<Writable<T>>;
export function char(a?: string | PgCharConfig, b: PgCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<PgCharConfig>(a, b);
	return new PgCharBuilder(name, config as any);
}
