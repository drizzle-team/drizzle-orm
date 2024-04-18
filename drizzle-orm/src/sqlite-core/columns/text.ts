import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySQLiteTable } from '~/sqlite-core/table.ts';
import type { Equal, Writable } from '~/utils.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export type SQLiteTextBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = SQLiteTextBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SQLiteText';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
}>;

export class SQLiteTextBuilder<T extends ColumnBuilderBaseConfig<'string', 'SQLiteText'>> extends SQLiteColumnBuilder<
	T,
	{ length: number | undefined; enumValues: T['enumValues'] }
> {
	static readonly [entityKind]: string = 'SQLiteTextBuilder';

	constructor(name: T['name'], config: SQLiteTextConfig<'text', T['enumValues']>) {
		super(name, 'string', 'SQLiteText');
		this.config.enumValues = config.enum;
		this.config.length = config.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteText<MakeColumnConfig<T, TTableName>> {
		return new SQLiteText<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class SQLiteText<T extends ColumnBaseConfig<'string', 'SQLiteText'>>
	extends SQLiteColumn<T, { length: number | undefined; enumValues: T['enumValues'] }>
{
	static readonly [entityKind]: string = 'SQLiteText';

	override readonly enumValues = this.config.enumValues;

	readonly length: number | undefined = this.config.length;

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

export type SQLiteTextDateBuilderInitial<TName extends string> = SQLiteTextDateBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'SQLiteTextDate';
	data: Date;
	driverParam: string;
	enumValues: undefined;
}>;

export class SQLiteTextDateBuilder<T extends ColumnBuilderBaseConfig<'date', 'SQLiteTextDate'>>
extends SQLiteColumnBuilder<T>
{
static readonly [entityKind]: string = 'SQLiteTextDateBuilder';

constructor(name: T['name']) {
	super(name, 'date', 'SQLiteTextDate');
}

/** @internal */
override build<TTableName extends string>(
	table: AnySQLiteTable<{ name: TTableName }>,
): SQLiteTextDate<MakeColumnConfig<T, TTableName>> {
	return new SQLiteTextDate<MakeColumnConfig<T, TTableName>>(
		table,
		this.config as ColumnBuilderRuntimeConfig<any, any>,
	);
}
}

export class SQLiteTextDate<T extends ColumnBaseConfig<'date', 'SQLiteTextDate'>> 
	extends SQLiteColumn<T, { length: number | undefined; enumValues: T['enumValues'] }> 
{
	static readonly [entityKind]: string = 'SQLiteTextDate';

	getSQLType(): string {
		return 'text';
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}

	override mapToDriverValue(value: Date): string {
		return value.toISOString();
	}
}

export type SQLiteTextJsonBuilderInitial<TName extends string> = SQLiteTextJsonBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'SQLiteTextJson';
	data: unknown;
	driverParam: string;
	enumValues: undefined;
}>;

export class SQLiteTextJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'SQLiteTextJson'>>
	extends SQLiteColumnBuilder<T>
{
	static readonly [entityKind]: string = 'SQLiteTextJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'SQLiteTextJson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteTextJson<MakeColumnConfig<T, TTableName>> {
		return new SQLiteTextJson<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SQLiteTextJson<T extends ColumnBaseConfig<'json', 'SQLiteTextJson'>>
	extends SQLiteColumn<T, { length: number | undefined; enumValues: T['enumValues'] }>
{
	static readonly [entityKind]: string = 'SQLiteTextJson';

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
	TMode extends 'text' | 'json' | 'date',
	TEnum extends readonly string[] | string[] | undefined,
> = TMode extends 'text' ? {
		mode?: TMode;
		length?: number;
		enum?: TEnum;
	}
	: {
		mode?: TMode;
	};

export function text<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	TMode extends 'text' | 'json' | 'date' = 'text' | 'json' | 'date',
>(
	name: TName,
	config: SQLiteTextConfig<TMode, T | Writable<T>> = {} as SQLiteTextConfig<TMode, T | Writable<T>>,
): Equal<TMode, 'json'> extends true ? SQLiteTextJsonBuilderInitial<TName>
	: Equal<TMode, 'date'> extends true ? SQLiteTextDateBuilderInitial<TName>
	: SQLiteTextBuilderInitial<TName, Writable<T>>
{
	return (config.mode === 'json'
		? new SQLiteTextJsonBuilder(name)
		: config.mode === 'date'
		? new SQLiteTextDateBuilder(name)
		: new SQLiteTextBuilder(name, config as SQLiteTextConfig<'text', Writable<T>>)) as Equal<TMode, 'json'> extends true
			? SQLiteTextJsonBuilderInitial<TName>
			: Equal<TMode, 'date'> extends true
			? SQLiteTextDateBuilderInitial<TName>
			: SQLiteTextBuilderInitial<TName, Writable<T>>;
}
