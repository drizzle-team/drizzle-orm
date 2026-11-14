import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { Writable } from '~/utils.ts';
import { escapeClickHouseString } from '../literals.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder } from './common.ts';

export type ClickHouseEnumTypeName = 'Enum8' | 'Enum16';

/**
 * The members of an enum, either as a list (numbered from 1 in order) or as an explicit
 * name-to-number mapping.
 */
export type ClickHouseEnumValues<TValues extends string = string> =
	| readonly [TValues, ...TValues[]]
	| Record<TValues, number>;

interface ClickHouseEnumRuntimeConfig<TEnum = string[] | undefined> {
	chType: ClickHouseEnumTypeName;
	/** Members in declaration order, paired with the numeric value ClickHouse stores. */
	members: [string, number][];
	enumValues: TEnum;
}

/** The member names of an enum declared as an explicit name-to-number mapping. */
export type ClickHouseEnumRecordValues<T extends Record<string, number>> = [
	Extract<keyof T, string>,
	...Extract<keyof T, string>[],
];

export type ClickHouseEnumBuilderInitial<
	TName extends string,
	TColumnType extends string,
	TValues extends [string, ...string[]],
> = ClickHouseEnumBuilder<{
	name: TName;
	dataType: 'string';
	columnType: TColumnType;
	data: TValues[number];
	driverParam: string;
	enumValues: TValues;
}>;

function toMembers(values: ClickHouseEnumValues): [string, number][] {
	if (Array.isArray(values)) {
		return (values as readonly string[]).map((name, index) => [name, index + 1]);
	}
	return Object.entries(values as Record<string, number>);
}

export class ClickHouseEnumBuilder<T extends ColumnBuilderBaseConfig<'string', string>>
	extends ClickHouseColumnBuilder<T, ClickHouseEnumRuntimeConfig<T['enumValues']>>
{
	static override readonly [entityKind]: string = 'ClickHouseEnumBuilder';

	constructor(
		name: T['name'],
		columnType: T['columnType'],
		chType: ClickHouseEnumTypeName,
		values: ClickHouseEnumValues,
	) {
		super(name, 'string', columnType);
		const members = toMembers(values);
		if (members.length === 0) {
			throw new Error(`${chType} column "${name}" must declare at least one member`);
		}
		this.config.chType = chType;
		this.config.members = members;
		this.config.enumValues = members.map(([member]) => member) as T['enumValues'];
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseEnum<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseEnum<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseEnum<T extends ColumnBaseConfig<'string', string>>
	extends ClickHouseColumn<T, ClickHouseEnumRuntimeConfig<T['enumValues']>>
{
	static override readonly [entityKind]: string = 'ClickHouseEnum';

	readonly chType: ClickHouseEnumTypeName = this.config.chType;
	readonly members: [string, number][] = this.config.members;

	override readonly enumValues = this.config.enumValues;

	getBaseSQLType(): string {
		const members = this.members
			.map(([member, value]) => `${escapeClickHouseString(member)} = ${value}`)
			.join(', ');
		return `${this.chType}(${members})`;
	}
}

function enumFactory<TColumnType extends string>(columnType: TColumnType, chType: ClickHouseEnumTypeName) {
	function column<U extends string, T extends Readonly<[U, ...U[]]>>(
		values: T | Writable<T>,
	): ClickHouseEnumBuilderInitial<'', TColumnType, Writable<T>>;
	function column<T extends Record<string, number>>(
		values: T,
	): ClickHouseEnumBuilderInitial<'', TColumnType, ClickHouseEnumRecordValues<T>>;
	function column<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
		name: TName,
		values: T | Writable<T>,
	): ClickHouseEnumBuilderInitial<TName, TColumnType, Writable<T>>;
	function column<TName extends string, T extends Record<string, number>>(
		name: TName,
		values: T,
	): ClickHouseEnumBuilderInitial<TName, TColumnType, ClickHouseEnumRecordValues<T>>;
	function column(a: string | ClickHouseEnumValues, b?: ClickHouseEnumValues): any {
		const isNamed = typeof a === 'string';
		return new ClickHouseEnumBuilder(
			isNamed ? a : '',
			columnType,
			chType,
			(isNamed ? b : a) as ClickHouseEnumValues,
		);
	}
	return column;
}

/**
 * `Enum8` — a string enum stored as a signed byte, so up to 256 members.
 *
 * ```ts
 * status: enum8(['pending', 'done']),        // 'pending' = 1, 'done' = 2
 * level: enum8({ debug: 0, error: 10 }),     // explicit numbering
 * ```
 */
export const enum8 = enumFactory('ClickHouseEnum8', 'Enum8');

/** `Enum16` — a string enum stored as a signed 16-bit integer, so up to 65536 members. */
export const enum16 = enumFactory('ClickHouseEnum16', 'Enum16');
