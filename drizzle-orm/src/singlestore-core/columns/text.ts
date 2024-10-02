import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import type { Writable } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreTextColumnType = 'tinytext' | 'text' | 'mediumtext' | 'longtext';

export type SingleStoreTextBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> =
	SingleStoreTextBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'SingleStoreText';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
		generated: undefined;
	}>;

export class SingleStoreTextBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreText'>>
	extends SingleStoreColumnBuilder<
		T,
		{ textType: SingleStoreTextColumnType; enumValues: T['enumValues'] }
	>
{
	static readonly [entityKind]: string = 'SingleStoreTextBuilder';

	constructor(name: T['name'], textType: SingleStoreTextColumnType, config: SingleStoreTextConfig<T['enumValues']>) {
		super(name, 'string', 'SingleStoreText');
		this.config.textType = textType;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreText<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreText<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreText<T extends ColumnBaseConfig<'string', 'SingleStoreText'>>
	extends SingleStoreColumn<T, { textType: SingleStoreTextColumnType; enumValues: T['enumValues'] }>
{
	static readonly [entityKind]: string = 'SingleStoreText';

	private textType: SingleStoreTextColumnType = this.config.textType;

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.textType;
	}
}

export interface SingleStoreTextConfig<TEnum extends readonly string[] | string[] | undefined> {
	enum?: TEnum;
}

export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: SingleStoreTextConfig<T | Writable<T>> = {},
): SingleStoreTextBuilderInitial<TName, Writable<T>> {
	return new SingleStoreTextBuilder(name, 'text', config);
}

export function tinytext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: SingleStoreTextConfig<T | Writable<T>> = {},
): SingleStoreTextBuilderInitial<TName, Writable<T>> {
	return new SingleStoreTextBuilder(name, 'tinytext', config);
}

export function mediumtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: SingleStoreTextConfig<T | Writable<T>> = {},
): SingleStoreTextBuilderInitial<TName, Writable<T>> {
	return new SingleStoreTextBuilder(name, 'mediumtext', config);
}

export function longtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: SingleStoreTextConfig<T | Writable<T>> = {},
): SingleStoreTextBuilderInitial<TName, Writable<T>> {
	return new SingleStoreTextBuilder(name, 'longtext', config);
}
