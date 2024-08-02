import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

type PgTextBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = PgTextBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgText';
	data: TEnum[number];
	enumValues: TEnum;
	driverParam: string;
	generated: undefined;
}>;

export class PgTextBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'PgText'>,
> extends PgColumnBuilder<T, { enumValues: T['enumValues'] }> {
	static readonly [entityKind]: string = 'PgTextBuilder';

	constructor(
		name: string,
		config: PgTextConfig<T['enumValues']>,
	) {
		super(name, 'string', 'PgText');
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgText<MakeColumnConfig<T, TTableName>> {
		return new PgText<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgText<T extends ColumnBaseConfig<'string', 'PgText'>>
	extends PgColumn<T, { enumValues: T['enumValues'] }>
{
	static readonly [entityKind]: string = 'PgText';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return 'text';
	}
}

export interface PgTextConfig<TEnum extends readonly string[] | string[] | undefined> {
	enum?: TEnum;
}

export function text(): PgTextBuilderInitial<'', [string, ...string[]]>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: PgTextConfig<T | Writable<T>>,
): PgTextBuilderInitial<'', Writable<T>>;
export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: PgTextConfig<T | Writable<T>>,
): PgTextBuilderInitial<TName, Writable<T>>;
export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	a?: TName | PgTextConfig<T | Writable<T>>,
	b: PgTextConfig<T | Writable<T>> = {},
): PgTextBuilderInitial<TName, Writable<T>> {
	const { name, config } = getColumnNameAndConfig<TName, PgTextConfig<T | Writable<T>>>(a, b);
	return new PgTextBuilder(name, config);
}
