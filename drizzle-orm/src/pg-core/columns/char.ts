import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

type PgCharBuilderConfig<TEnum extends [string, ...string[]] | undefined> = TEnum extends [string, ...string[]]
	? { dataType: 'string enum'; data: TEnum[number]; enumValues: TEnum; driverParam: string }
	: { dataType: 'string'; data: string; driverParam: string };

export class PgCharBuilder<
	TEnum extends [string, ...string[]] | undefined = undefined,
> extends PgColumnBuilder<
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

export class PgChar<TEnum extends [string, ...string[]] | undefined = undefined>
	extends PgColumn<TEnum extends [string, ...string[]] ? 'string enum' : 'string'>
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

export function char(): PgCharBuilder<undefined>;
export function char(name: string): PgCharBuilder<undefined>;
export function char(config: { length?: number }): PgCharBuilder<undefined>;
export function char(name: string, config: { length?: number }): PgCharBuilder<undefined>;
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
