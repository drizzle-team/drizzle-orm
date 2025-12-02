import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreTextColumnType = 'tinytext' | 'text' | 'mediumtext' | 'longtext';

export class SingleStoreTextBuilder<TEnum extends [string, ...string[]]> extends SingleStoreColumnBuilder<
	{
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
	},
	{ textType: SingleStoreTextColumnType; enumValues?: TEnum; length: number | undefined }
> {
	static override readonly [entityKind]: string = 'SingleStoreTextBuilder';

	constructor(name: string, textType: SingleStoreTextColumnType, config: SingleStoreTextConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'SingleStoreText');
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
	override build(table: SingleStoreTable) {
		return new SingleStoreText(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreText<T extends ColumnBaseConfig<'string' | 'string enum'>>
	extends SingleStoreColumn<T, { textType: SingleStoreTextColumnType; enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'SingleStoreText';

	readonly textType: SingleStoreTextColumnType = this.config.textType;

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.textType;
	}
}

export interface SingleStoreTextConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
}

export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: SingleStoreTextConfig<T | Writable<T>>,
): SingleStoreTextBuilder<Writable<T>>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: SingleStoreTextConfig<T | Writable<T>>,
): SingleStoreTextBuilder<Writable<T>>;
export function text(a?: string | SingleStoreTextConfig, b: SingleStoreTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<SingleStoreTextConfig>(a, b);
	return new SingleStoreTextBuilder(name, 'text', config as any);
}

export function tinytext<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: SingleStoreTextConfig<T | Writable<T>>,
): SingleStoreTextBuilder<Writable<T>>;
export function tinytext<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: SingleStoreTextConfig<T | Writable<T>>,
): SingleStoreTextBuilder<Writable<T>>;
export function tinytext(a?: string | SingleStoreTextConfig, b: SingleStoreTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<SingleStoreTextConfig>(a, b);
	return new SingleStoreTextBuilder(name, 'tinytext', config as any);
}

export function mediumtext<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: SingleStoreTextConfig<T | Writable<T>>,
): SingleStoreTextBuilder<Writable<T>>;
export function mediumtext<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: SingleStoreTextConfig<T | Writable<T>>,
): SingleStoreTextBuilder<Writable<T>>;
export function mediumtext(a?: string | SingleStoreTextConfig, b: SingleStoreTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<SingleStoreTextConfig>(a, b);
	return new SingleStoreTextBuilder(name, 'mediumtext', config as any);
}

export function longtext<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: SingleStoreTextConfig<T | Writable<T>>,
): SingleStoreTextBuilder<Writable<T>>;
export function longtext<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: SingleStoreTextConfig<T | Writable<T>>,
): SingleStoreTextBuilder<Writable<T>>;
export function longtext(a?: string | SingleStoreTextConfig, b: SingleStoreTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<SingleStoreTextConfig>(a, b);
	return new SingleStoreTextBuilder(name, 'longtext', config as any);
}
