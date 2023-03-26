import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import type { Assume } from '~/utils';
import { PgColumn } from './common';
import { PgDateColumnBaseBuilder } from './date.common';

export interface PgDateBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgDateBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgDateHKT;
}

export interface PgDateHKT extends ColumnHKTBase {
	_type: PgDate<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgDateBuilderInitial<TName extends string> = PgDateBuilder<{
	name: TName;
	data: Date;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgDateBuilder<T extends ColumnBuilderBaseConfig> extends PgDateColumnBaseBuilder<PgDateBuilderHKT, T> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDate<MakeColumnConfig<T, TTableName>> {
		return new PgDate<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgDate<T extends ColumnBaseConfig> extends PgColumn<PgDateHKT, T> {
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

export interface PgDateStringBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgDateStringBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgDateStringHKT;
}

export interface PgDateStringHKT extends ColumnHKTBase {
	_type: PgDateString<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgDateStringBuilderInitial<TName extends string> = PgDateStringBuilder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgDateStringBuilder<T extends ColumnBuilderBaseConfig>
	extends PgDateColumnBaseBuilder<PgDateStringBuilderHKT, T>
{
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDateString<MakeColumnConfig<T, TTableName>> {
		return new PgDateString<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgDateString<T extends ColumnBaseConfig> extends PgColumn<PgDateStringHKT, T> {
	getSQLType(): string {
		return 'date';
	}
}

export function date<TName extends string>(
	name: TName,
	config?: { mode: 'string' },
): PgDateStringBuilderInitial<TName>;
export function date<TName extends string>(TName: TName, config?: { mode: 'date' }): PgDateBuilderInitial<TName>;
export function date<TName extends string>(name: TName, config?: { mode: 'date' | 'string' }) {
	if (config?.mode === 'date') {
		return new PgDateBuilder(name);
	}
	return new PgDateStringBuilder(name);
}
