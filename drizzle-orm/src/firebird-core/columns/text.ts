import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '~/firebird-core/table.ts';
import { type Equal, getColumnNameAndConfig, textDecoder, type Writable } from '~/utils.ts';
import { FirebirdColumn, FirebirdColumnBuilder } from './common.ts';

export type FirebirdTextBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = FirebirdTextBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'FirebirdText';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
	length: TLength;
}>;

export class FirebirdTextBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'FirebirdText'> & { length?: number | undefined },
> extends FirebirdColumnBuilder<
	T,
	{ length: T['length']; enumValues: T['enumValues'] },
	{ length: T['length'] }
> {
	static override readonly [entityKind]: string = 'FirebirdTextBuilder';

	constructor(name: T['name'], config: FirebirdTextConfig<'text', T['enumValues'], T['length']>) {
		super(name, 'string', 'FirebirdText');
		this.config.enumValues = config.enum;
		this.config.length = config.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdText<MakeColumnConfig<T, TTableName> & { length: T['length'] }> {
		return new FirebirdText<MakeColumnConfig<T, TTableName> & { length: T['length'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdText<T extends ColumnBaseConfig<'string', 'FirebirdText'> & { length?: number | undefined }>
	extends FirebirdColumn<T, { length: T['length']; enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'FirebirdText';

	override readonly enumValues = this.config.enumValues;

	readonly length: T['length'] = this.config.length;

	constructor(
		table: AnyFirebirdTable<{ name: T['tableName'] }>,
		config: FirebirdTextBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return this.length === undefined ? 'varchar(8191)' : `varchar(${this.length})`;
	}

	override mapFromDriverValue(value: Buffer | Uint8Array | ArrayBuffer | string): string {
		if (typeof value === 'string') return value;

		if (typeof Buffer !== 'undefined' && Buffer.from) {
			const buf = Buffer.isBuffer(value)
				? value
				// eslint-disable-next-line no-instanceof/no-instanceof
				: value instanceof ArrayBuffer
				? Buffer.from(value)
				: value.buffer
				? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
				: Buffer.from(value);
			return buf.toString('utf8');
		}

		return textDecoder!.decode(value);
	}

	override mapToDriverValue(value: string): string {
		return value;
	}
}

export type FirebirdTextJsonBuilderInitial<TName extends string> = FirebirdTextJsonBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'FirebirdTextJson';
	data: unknown;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class FirebirdTextJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'FirebirdTextJson'>>
	extends FirebirdColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'FirebirdTextJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'FirebirdTextJson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdTextJson<MakeColumnConfig<T, TTableName>> {
		return new FirebirdTextJson<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdTextJson<T extends ColumnBaseConfig<'json', 'FirebirdTextJson'>>
	extends FirebirdColumn<T, { length: number | undefined; enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'FirebirdTextJson';

	getSQLType(): string {
		return 'varchar(8191)';
	}

	override mapFromDriverValue(value: Buffer | Uint8Array | ArrayBuffer | string): T['data'] {
		if (typeof value === 'string') return JSON.parse(value);

		if (typeof Buffer !== 'undefined' && Buffer.from) {
			const buf = Buffer.isBuffer(value)
				? value
				// eslint-disable-next-line no-instanceof/no-instanceof
				: value instanceof ArrayBuffer
				? Buffer.from(value)
				: value.buffer
				? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
				: Buffer.from(value);
			return JSON.parse(buf.toString('utf8'));
		}

		return JSON.parse(textDecoder!.decode(value));
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}
}

export type FirebirdTextConfig<
	TMode extends 'text' | 'json' = 'text' | 'json',
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> = TMode extends 'text' ? {
		mode?: TMode;
		length?: TLength;
		enum?: TEnum;
	}
	: {
		mode?: TMode;
	};

export function text(): FirebirdTextBuilderInitial<'', [string, ...string[]], undefined>;
export function text<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
	TMode extends 'text' | 'json' = 'text' | 'json',
>(
	config?: FirebirdTextConfig<TMode, T | Writable<T>, L>,
): Equal<TMode, 'json'> extends true ? FirebirdTextJsonBuilderInitial<''>
	: FirebirdTextBuilderInitial<'', Writable<T>, L>;
export function text<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
	TMode extends 'text' | 'json' = 'text' | 'json',
>(
	name: TName,
	config?: FirebirdTextConfig<TMode, T | Writable<T>, L>,
): Equal<TMode, 'json'> extends true ? FirebirdTextJsonBuilderInitial<TName>
	: FirebirdTextBuilderInitial<TName, Writable<T>, L>;
export function text(a?: string | FirebirdTextConfig, b: FirebirdTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<FirebirdTextConfig>(a, b);
	if (config.mode === 'json') {
		return new FirebirdTextJsonBuilder(name);
	}
	return new FirebirdTextBuilder(name, config as any);
}
