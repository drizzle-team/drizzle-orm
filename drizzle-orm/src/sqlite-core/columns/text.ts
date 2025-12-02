import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySQLiteTable, SQLiteTable } from '~/sqlite-core/table.ts';
import { type Assume, type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export class SQLiteTextBuilder<
	TEnum extends [string, ...string[]],
> extends SQLiteColumnBuilder<
	{
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
	},
	{ enumValues: TEnum; length: number | undefined }
> {
	static override readonly [entityKind]: string = 'SQLiteTextBuilder';

	constructor(name: string, config: SQLiteTextConfig<'text', TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'SQLiteText');
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

export class SQLiteText<T extends ColumnBaseConfig<'string' | 'string enum'>>
	extends SQLiteColumn<T, { length: number | undefined; enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'SQLiteText';

	override readonly enumValues = this.config.enumValues;

	constructor(
		table: AnySQLiteTable<{ name: T['tableName'] }>,
		config: SQLiteTextBuilder<Assume<T['enumValues'], [string, ...string[]]>>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `text${this.config.length ? `(${this.config.length})` : ''}`;
	}
}

export class SQLiteTextJsonBuilder extends SQLiteColumnBuilder<{
	dataType: 'object json';
	data: unknown;
	driverParam: string;

	generated: undefined;
}> {
	static override readonly [entityKind]: string = 'SQLiteTextJsonBuilder';

	constructor(name: string) {
		super(name, 'object json', 'SQLiteTextJson');
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteTextJson(
			table,
			this.config as any,
		);
	}
}

export class SQLiteTextJson<T extends ColumnBaseConfig<'object json'>>
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
> = TMode extends 'text' ? {
		mode?: TMode;
		length?: number;
		enum?: TEnum;
	}
	: {
		mode?: TMode;
	};

export function text<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	TMode extends 'text' | 'json' = 'text' | 'json',
>(
	config?: SQLiteTextConfig<TMode, T | Writable<T>>,
): Equal<TMode, 'json'> extends true ? SQLiteTextJsonBuilder
	: SQLiteTextBuilder<Writable<T>>;
export function text<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	TMode extends 'text' | 'json' = 'text' | 'json',
>(
	name: string,
	config?: SQLiteTextConfig<TMode, T | Writable<T>>,
): Equal<TMode, 'json'> extends true ? SQLiteTextJsonBuilder
	: SQLiteTextBuilder<Writable<T>>;
export function text(a?: string | SQLiteTextConfig, b: SQLiteTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<SQLiteTextConfig>(a, b);
	if (config.mode === 'json') {
		return new SQLiteTextJsonBuilder(name);
	}
	return new SQLiteTextBuilder(name, config as any);
}
