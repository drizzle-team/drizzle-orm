import { AnyMySqlTable } from '~/mysql-core/table';
import { Update } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlEnumColumnBuilderConfig {
	notNull: boolean;
	hasDefault: boolean;
	values: [string, ...string[]];
}

export interface MySqlEnumColumnConfig extends MySqlEnumColumnBuilderConfig {
	tableName: string;
}

export class MySqlEnumColumnBuilder<T extends MySqlEnumColumnBuilderConfig = MySqlEnumColumnBuilderConfig>
	extends MySqlColumnBuilder<
		{ data: T['values'][number]; driverParam: string; notNull: T['notNull']; hasDefault: T['hasDefault'] },
		{ values: T['values'] }
	>
{
	constructor(name: string, values: T['values']) {
		super(name);
		this.config.values = values;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlEnumColumn<Pick<T, keyof MySqlEnumColumnBuilderConfig> & { tableName: TTableName }> {
		return new MySqlEnumColumn<Pick<T, keyof MySqlEnumColumnBuilderConfig> & { tableName: TTableName }>(
			table,
			this.config,
		);
	}
}

export class MySqlEnumColumn<T extends MySqlEnumColumnConfig> extends MySqlColumn<{
	tableName: T['tableName'];
	data: T['values'][number];
	driverParam: string;
	notNull: T['notNull'];
	hasDefault: T['hasDefault'];
}> {
	protected override $mySqlColumnBrand!: 'MySqlEnumColumn';

	readonly values: T['values'];

	constructor(
		table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlEnumColumnBuilder<Pick<T, keyof MySqlEnumColumnBuilderConfig>>['config'],
	) {
		super(table, config);
		this.values = config.values;
	}

	getSQLType(): string {
		return `enum(${this.values.map((value) => `'${value}'`).join(',')})`;
	}
}

export function mysqlEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	values: T,
): MySqlEnumColumnBuilder<
	Update<MySqlEnumColumnBuilderConfig, {
		notNull: false;
		hasDefault: false;
		values: Writeable<T>;
	}>
> {
	if (values.length === 0) throw Error(`You have an empty array for "${name}" enum values`);

	return new MySqlEnumColumnBuilder(name, values);
}

export type Writeable<T> = {
	-readonly [P in keyof T]: T[P];
};
