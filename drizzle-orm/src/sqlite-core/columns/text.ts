import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySQLiteTable, SQLiteTable } from '~/sqlite-core/table.ts';
import { type Assume, type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export class SQLiteTextBuilder<
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> extends SQLiteColumnBuilder<
	{
		name: string;
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string text' : 'enum';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
		length: TLength;
	},
	{ enumValues: TEnum; length: TLength }
> {
	static override readonly [entityKind]: string = 'SQLiteTextBuilder';

	constructor(name: string, config: SQLiteTextConfig<'text', TEnum, TLength>) {
		super(name, config.enum?.length ? 'enum' : 'string text', 'SQLiteText');
		this.config.enumValues = config.enum!;
		this.config.length = config.length!;
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteText(
			table,
			this.config as any,
		);
	}
}

export class SQLiteText<T extends ColumnBaseConfig<'string text' | 'enum'> & { length?: number | undefined }>
	extends SQLiteColumn<T, { length: T['length']; enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'SQLiteText';

	override readonly enumValues = this.config.enumValues;

	readonly length: T['length'] = this.config.length;

	constructor(
		table: AnySQLiteTable<{ name: T['tableName'] }>,
		config: SQLiteTextBuilder<Assume<T['enumValues'], [string, ...string[]]>, T['length']>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `text${this.config.length ? `(${this.config.length})` : ''}`;
	}
}

export class SQLiteTextJsonBuilder extends SQLiteColumnBuilder<{
	name: string;
	dataType: 'json';
	data: unknown;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}> {
	static override readonly [entityKind]: string = 'SQLiteTextJsonBuilder';

	constructor(name: string) {
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

export function text<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
	TMode extends 'text' | 'json' = 'text' | 'json',
>(
	config?: SQLiteTextConfig<TMode, T | Writable<T>, L>,
): Equal<TMode, 'json'> extends true ? SQLiteTextJsonBuilder
	: SQLiteTextBuilder<Writable<T>, L>;
export function text<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
	TMode extends 'text' | 'json' = 'text' | 'json',
>(
	name: string,
	config?: SQLiteTextConfig<TMode, T | Writable<T>, L>,
): Equal<TMode, 'json'> extends true ? SQLiteTextJsonBuilder
	: SQLiteTextBuilder<Writable<T>, L>;
export function text(a?: string | SQLiteTextConfig, b: SQLiteTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<SQLiteTextConfig>(a, b);
	if (config.mode === 'json') {
		return new SQLiteTextJsonBuilder(name);
	}
	return new SQLiteTextBuilder(name, config as any);
}
