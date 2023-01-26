import { UpdateCBConfig } from '~/column-builder';
import { AnyPgTable } from '~/pg-core/table';

import { SQL } from '~/sql';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgTextBuilderConfig {
	notNull: boolean;
	hasDefault: boolean;
	data: string;
}

export interface PgTextConfig extends PgTextBuilderConfig {
	tableName: string;
}

export class PgTextBuilder<T extends PgTextBuilderConfig> extends PgColumnBuilder<
	{ notNull: T['notNull']; hasDefault: T['hasDefault']; data: T['data']; driverParam: string }
> {
	protected override $pgColumnBuilderBrand!: 'PgTextBuilder';

	override notNull(): PgTextBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.notNull() as any;
	}

	override default(value: T['data'] | SQL): PgTextBuilder<UpdateCBConfig<T, { hasDefault: true }>> {
		return super.default(value) as any;
	}

	override primaryKey(): PgTextBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.primaryKey() as any;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgText<Pick<T, keyof PgTextBuilderConfig> & { tableName: TTableName }> {
		return new PgText<Pick<T, keyof PgTextBuilderConfig> & { tableName: TTableName }>(table, this.config);
	}
}

export class PgText<T extends PgTextConfig> extends PgColumn<
	{
		tableName: T['tableName'];
		data: T['data'];
		driverParam: string;
		notNull: T['notNull'];
		hasDefault: T['hasDefault'];
	}
> {
	protected override $pgColumnBrand!: 'PgText';

	getSQLType(): string {
		return 'text';
	}
}

export function text<T extends string = string>(
	name: string,
): PgTextBuilder<{ hasDefault: false; notNull: false; data: T }> {
	return new PgTextBuilder(name);
}
