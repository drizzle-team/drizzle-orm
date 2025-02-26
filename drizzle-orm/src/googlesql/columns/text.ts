import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlTextColumnType = 'tinytext' | 'text' | 'mediumtext' | 'longtext';

export type GoogleSqlTextBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> =
	GoogleSqlTextBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'GoogleSqlText';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
	}>;

export class GoogleSqlTextBuilder<T extends ColumnBuilderBaseConfig<'string', 'GoogleSqlText'>>
	extends GoogleSqlColumnBuilder<
		T,
		{ textType: GoogleSqlTextColumnType; enumValues: T['enumValues'] }
	>
{
	static override readonly [entityKind]: string = 'GoogleSqlTextBuilder';

	constructor(name: T['name'], textType: GoogleSqlTextColumnType, config: GoogleSqlTextConfig<T['enumValues']>) {
		super(name, 'string', 'GoogleSqlText');
		this.config.textType = textType;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlText<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlText<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlText<T extends ColumnBaseConfig<'string', 'GoogleSqlText'>>
	extends GoogleSqlColumn<T, { textType: GoogleSqlTextColumnType; enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'GoogleSqlText';

	readonly textType: GoogleSqlTextColumnType = this.config.textType;

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.textType;
	}
}

export interface GoogleSqlTextConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
}

export function text(): GoogleSqlTextBuilderInitial<'', [string, ...string[]]>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: GoogleSqlTextConfig<T | Writable<T>>,
): GoogleSqlTextBuilderInitial<'', Writable<T>>;
export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: GoogleSqlTextConfig<T | Writable<T>>,
): GoogleSqlTextBuilderInitial<TName, Writable<T>>;
export function text(a?: string | GoogleSqlTextConfig, b: GoogleSqlTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<GoogleSqlTextConfig>(a, b);
	return new GoogleSqlTextBuilder(name, 'text', config as any);
}

export function tinytext(): GoogleSqlTextBuilderInitial<'', [string, ...string[]]>;
export function tinytext<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: GoogleSqlTextConfig<T | Writable<T>>,
): GoogleSqlTextBuilderInitial<'', Writable<T>>;
export function tinytext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: GoogleSqlTextConfig<T | Writable<T>>,
): GoogleSqlTextBuilderInitial<TName, Writable<T>>;
export function tinytext(a?: string | GoogleSqlTextConfig, b: GoogleSqlTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<GoogleSqlTextConfig>(a, b);
	return new GoogleSqlTextBuilder(name, 'tinytext', config as any);
}

export function mediumtext(): GoogleSqlTextBuilderInitial<'', [string, ...string[]]>;
export function mediumtext<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: GoogleSqlTextConfig<T | Writable<T>>,
): GoogleSqlTextBuilderInitial<'', Writable<T>>;
export function mediumtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: GoogleSqlTextConfig<T | Writable<T>>,
): GoogleSqlTextBuilderInitial<TName, Writable<T>>;
export function mediumtext(a?: string | GoogleSqlTextConfig, b: GoogleSqlTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<GoogleSqlTextConfig>(a, b);
	return new GoogleSqlTextBuilder(name, 'mediumtext', config as any);
}

export function longtext(): GoogleSqlTextBuilderInitial<'', [string, ...string[]]>;
export function longtext<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: GoogleSqlTextConfig<T | Writable<T>>,
): GoogleSqlTextBuilderInitial<'', Writable<T>>;
export function longtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: GoogleSqlTextConfig<T | Writable<T>>,
): GoogleSqlTextBuilderInitial<TName, Writable<T>>;
export function longtext(a?: string | GoogleSqlTextConfig, b: GoogleSqlTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<GoogleSqlTextConfig>(a, b);
	return new GoogleSqlTextBuilder(name, 'longtext', config as any);
}
