import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { MySqlStringBaseColumn, MySqlStringColumnBaseBuilder } from './string.common.ts';

export type MySqlTextColumnType = 'tinytext' | 'text' | 'mediumtext' | 'longtext';

export class MySqlTextBuilder<TEnum extends [string, ...string[]]> extends MySqlStringColumnBaseBuilder<
	{
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
	},
	{ textType: MySqlTextColumnType; enumValues?: TEnum; length: number }
> {
	static override readonly [entityKind]: string = 'MySqlTextBuilder';

	constructor(name: string, textType: MySqlTextColumnType, config: MySqlTextConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'MySqlText');
		this.config.textType = textType;
		this.config.enumValues = config.enum;
		switch (textType) {
			case 'tinytext': {
				this.config.length = 255;
				break;
			}
			case 'text': {
				this.config.length = 65535;
				break;
			}
			case 'mediumtext': {
				this.config.length = 16777215;
				break;
			}
			case 'longtext': {
				this.config.length = 4294967295;
				break;
			}
		}
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlText(table, this.config as any);
	}
}

export class MySqlText<T extends ColumnBaseConfig<'string' | 'string enum'>>
	extends MySqlStringBaseColumn<T, { textType: MySqlTextColumnType; enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'MySqlText';

	readonly textType: MySqlTextColumnType = this.config.textType;

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.textType;
	}
}

export interface MySqlTextConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
}

export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MySqlTextConfig<T | Writable<T>>,
): MySqlTextBuilder<Writable<T>>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: MySqlTextConfig<T | Writable<T>>,
): MySqlTextBuilder<Writable<T>>;
export function text(a?: string | MySqlTextConfig, b: MySqlTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<MySqlTextConfig>(a, b);
	return new MySqlTextBuilder(name, 'text', config as any);
}

export function tinytext<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MySqlTextConfig<T | Writable<T>>,
): MySqlTextBuilder<Writable<T>>;
export function tinytext<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: MySqlTextConfig<T | Writable<T>>,
): MySqlTextBuilder<Writable<T>>;
export function tinytext(a?: string | MySqlTextConfig, b: MySqlTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<MySqlTextConfig>(a, b);
	return new MySqlTextBuilder(name, 'tinytext', config as any);
}

export function mediumtext<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MySqlTextConfig<T | Writable<T>>,
): MySqlTextBuilder<Writable<T>>;
export function mediumtext<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: MySqlTextConfig<T | Writable<T>>,
): MySqlTextBuilder<Writable<T>>;
export function mediumtext(a?: string | MySqlTextConfig, b: MySqlTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<MySqlTextConfig>(a, b);
	return new MySqlTextBuilder(name, 'mediumtext', config as any);
}

export function longtext<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MySqlTextConfig<T | Writable<T>>,
): MySqlTextBuilder<Writable<T>>;
export function longtext<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: MySqlTextConfig<T | Writable<T>>,
): MySqlTextBuilder<Writable<T>>;
export function longtext(a?: string | MySqlTextConfig, b: MySqlTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<MySqlTextConfig>(a, b);
	return new MySqlTextBuilder(name, 'longtext', config as any);
}
