import { UpdateCBConfig } from 'drizzle-orm/column-builder';
import { SQL } from 'drizzle-orm/sql';
import { Update } from 'drizzle-orm/utils';
import { AnyPgTable } from '~/table';
import { PgColumn, PgColumnBuilder } from './common';

const isPgEnumSym = Symbol('isPgEnum');
export interface PgEnum<TValues extends [string, ...string[]]> {
	(name: string): PgEnumColumnBuilder<
		Update<PgEnumColumnBuilderConfig, {
			notNull: false;
			hasDefault: false;
			values: TValues;
		}>
	>;

	readonly enumName: string;
	readonly enumValues: TValues;
	/** @internal */
	[isPgEnumSym]: true;
}

export function isPgEnum(obj: unknown): obj is PgEnum<[string, ...string[]]> {
	return !!obj && typeof obj === 'function' && isPgEnumSym in obj;
}

export interface PgEnumColumnBuilderConfig {
	notNull: boolean;
	hasDefault: boolean;
	values: [string, ...string[]];
}

export interface PgEnumColumnConfig extends PgEnumColumnBuilderConfig {
	tableName: string;
}

export class PgEnumColumnBuilder<T extends PgEnumColumnBuilderConfig = PgEnumColumnBuilderConfig>
	extends PgColumnBuilder<
		{ data: T['values'][number]; driverParam: string; notNull: T['notNull']; hasDefault: T['hasDefault'] },
		{ enumInstance: PgEnum<T['values']> }
	>
{
	protected override $pgColumnBuilderBrand!: 'PgEnumColumnBuilder';

	constructor(name: string, enumInstance: PgEnum<T['values']>) {
		super(name);
		this.config.enumInstance = enumInstance;
	}

	override notNull(): PgEnumColumnBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.notNull() as ReturnType<this['notNull']>;
	}

	override default(value: T['values'][number] | SQL): PgEnumColumnBuilder<UpdateCBConfig<T, { hasDefault: true }>> {
		return super.default(value) as ReturnType<this['default']>;
	}

	override primaryKey(): PgEnumColumnBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.primaryKey() as ReturnType<this['primaryKey']>;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgEnumColumn<Pick<T, keyof PgEnumColumnBuilderConfig> & { tableName: TTableName }> {
		return new PgEnumColumn<Pick<T, keyof PgEnumColumnBuilderConfig> & { tableName: TTableName }>(table, this.config);
	}
}

export class PgEnumColumn<T extends PgEnumColumnConfig> extends PgColumn<
	{
		tableName: T['tableName'];
		data: T['values'][number];
		driverParam: string;
		notNull: T['notNull'];
		hasDefault: T['hasDefault'];
	}
> {
	protected override $pgColumnBrand!: 'PgEnumColumn';

	readonly enum: PgEnum<T['values']>;

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgEnumColumnBuilder<Pick<T, keyof PgEnumColumnBuilderConfig>>['config'],
	) {
		super(table, config);
		this.enum = config.enumInstance;
	}

	getSQLType(): string {
		return this.enum.enumName;
	}
}

// Gratitude to zod for the enum function types
export function pgEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
	enumName: string,
	values: T,
): PgEnum<Writeable<T>> {
	const enumInstance = Object.assign(
		(name: string) =>
			new PgEnumColumnBuilder<
				Update<PgEnumColumnBuilderConfig, {
					notNull: false;
					hasDefault: false;
					values: Writeable<T>;
				}>
			>(name, enumInstance),
		{
			enumName,
			enumValues: values,
			[isPgEnumSym]: true,
		} as const,
	);

	return enumInstance;
}

export type Writeable<T> = {
	-readonly [P in keyof T]: T[P];
};
