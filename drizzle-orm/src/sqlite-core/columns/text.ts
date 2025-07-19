import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySQLiteTable, SQLiteTable } from '~/sqlite-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export type SQLiteTextBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = SQLiteTextBuilder<{
	name: TName;
	dataType: 'string';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
	length: TLength;
}>;

export class SQLiteTextBuilder<
	T extends ColumnBuilderBaseConfig<'string'> & { length?: number | undefined },
> extends SQLiteColumnBuilder<
	T,
	{ length: T['length']; enumValues: T['enumValues'] }
> {
	static override readonly [entityKind]: string = 'SQLiteTextBuilder';

	constructor(name: T['name'], config: SQLiteTextConfig<'text', T['enumValues'], T['length']>) {
		super(name, 'string', 'SQLiteText');
		this.config.enumValues = config.enum;
		this.config.length = config.length;
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteText(
			table,
			this.config as any,
		);
	}
}

export class SQLiteText<T extends ColumnBaseConfig<'string'> & { length?: number | undefined }>
	extends SQLiteColumn<T, { length: T['length']; enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'SQLiteText';

	override readonly enumValues = this.config.enumValues;

	readonly length: T['length'] = this.config.length;

	constructor(
		table: AnySQLiteTable<{ name: T['tableName'] }>,
		config: SQLiteTextBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `text${this.config.length ? `(${this.config.length})` : ''}`;
	}
}

export type SQLiteTextJsonBuilderInitial<TName extends string> = SQLiteTextJsonBuilder<{
	name: TName;
	dataType: 'json';
	data: unknown;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SQLiteTextJsonBuilder<T extends ColumnBuilderBaseConfig<'json'>>
	extends SQLiteColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SQLiteTextJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'SQLiteTextJson');
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteTextJson(
			table,
			this.config as any,
		);
	}
}

export class SQLiteTextJson<T extends ColumnBaseConfig<'json'>>
	extends SQLiteColumn<T, { length: number | undefined; enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'SQLiteTextJson';

	getSQLType(): string {
		return 'text';
	}

	override mapFromDriverValue(value: string): T['data'] {
		return JSON.parse(value);
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}
}

export type SQLiteTextConfig<
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

export function text(): SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>;
export function text<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
	TMode extends 'text' | 'json' = 'text' | 'json',
>(
	config?: SQLiteTextConfig<TMode, T | Writable<T>, L>,
): Equal<TMode, 'json'> extends true ? SQLiteTextJsonBuilderInitial<''>
	: SQLiteTextBuilderInitial<'', Writable<T>, L>;
export function text<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
	TMode extends 'text' | 'json' = 'text' | 'json',
>(
	name: TName,
	config?: SQLiteTextConfig<TMode, T | Writable<T>, L>,
): Equal<TMode, 'json'> extends true ? SQLiteTextJsonBuilderInitial<TName>
	: SQLiteTextBuilderInitial<TName, Writable<T>, L>;
export function text(a?: string | SQLiteTextConfig, b: SQLiteTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<SQLiteTextConfig>(a, b);
	if (config.mode === 'json') {
		return new SQLiteTextJsonBuilder(name);
	}
	return new SQLiteTextBuilder(name, config as any);
}
