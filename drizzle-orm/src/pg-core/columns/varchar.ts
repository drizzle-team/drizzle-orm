import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

type PgVarcharBuilderConfig<TEnum extends [string, ...string[]] | undefined> = TEnum extends [string, ...string[]]
	? { dataType: 'string enum'; data: TEnum[number]; enumValues: TEnum; driverParam: string }
	: { dataType: 'string'; data: string; driverParam: string };

export class PgVarcharBuilder<
	TEnum extends [string, ...string[]] | undefined = undefined,
> extends PgColumnBuilder<
	PgVarcharBuilderConfig<TEnum>,
	{ length: number | undefined; enumValues: TEnum }
> {
	static override readonly [entityKind]: string = 'PgVarcharBuilder';

	constructor(name: string, config: PgVarcharConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'PgVarchar');
		this.config.length = config.length!;
		this.config.enumValues = config.enum as TEnum;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgVarchar(
			table,
			this.config as any,
		);
	}
}

export class PgVarchar<TEnum extends [string, ...string[]] | undefined = undefined>
	extends PgColumn<TEnum extends [string, ...string[]] ? 'string enum' : 'string'>
{
	static override readonly [entityKind]: string = 'PgVarchar';

	override readonly enumValues: TEnum;

	constructor(table: PgTable<any>, config: PgVarcharBuilder<TEnum>['config']) {
		super(table, config as any);
		this.enumValues = config.enumValues;
	}

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

export function varchar(): PgVarcharBuilder<undefined>;
export function varchar(name: string): PgVarcharBuilder<undefined>;
export function varchar(config: { length?: number }): PgVarcharBuilder<undefined>;
export function varchar(name: string, config: { length?: number }): PgVarcharBuilder<undefined>;
export function varchar<U extends string, T extends Readonly<[U, ...U[]]>>(
	config: PgVarcharConfig<T | Writable<T>> & { enum: T | Writable<T> },
): PgVarcharBuilder<Writable<T>>;
export function varchar<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config: PgVarcharConfig<T | Writable<T>> & { enum: T | Writable<T> },
): PgVarcharBuilder<Writable<T>>;
export function varchar(a?: string | PgVarcharConfig, b: PgVarcharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<PgVarcharConfig>(a, b);
	return new PgVarcharBuilder(name, config as any);
}
