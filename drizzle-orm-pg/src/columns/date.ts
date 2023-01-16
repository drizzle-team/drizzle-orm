import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyPgTable } from '~/table';
import { PgColumn } from './common';
import { PgDateColumnBaseBuilder } from './date.common';

export class PgDateBuilder extends PgDateColumnBaseBuilder<ColumnBuilderConfig<{ data: Date; driverParam: string }>> {
	protected override $pgColumnBuilderBrand!: 'PgDateBuilder';

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgDate<TTableName> {
		return new PgDate(table, this.config);
	}
}

export class PgDate<TTableName extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: Date; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgDate';

	constructor(table: AnyPgTable<{ name: TTableName }>, config: PgDateBuilder['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'date';
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}

	override mapToDriverValue(value: Date): string {
		return value.toISOString();
	}
}

export class PgDateStringBuilder
	extends PgDateColumnBaseBuilder<ColumnBuilderConfig<{ data: string; driverParam: string }>>
{
	protected override $pgColumnBuilderBrand!: 'PgDateStringBuilder';

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgDateString<TTableName> {
		return new PgDateString(table, this.config);
	}
}

export class PgDateString<
	TTableName extends string,
> extends PgColumn<ColumnConfig<{ tableName: TTableName; data: string; driverParam: string }>> {
	protected override $pgColumnBrand!: 'PgDateString';

	constructor(table: AnyPgTable<{ name: TTableName }>, config: PgDateStringBuilder['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'date';
	}
}

export function date(name: string, config?: { mode: 'string' }): PgDateStringBuilder;
export function date(name: string, config?: { mode: 'date' }): PgDateBuilder;
export function date(name: string, config?: { mode: 'date' | 'string' }) {
	if (config?.mode === 'date') {
		return new PgDateBuilder(name);
	}
	return new PgDateStringBuilder(name);
}
