import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '~/firebird-core/table.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import { FirebirdColumn, FirebirdColumnBuilder } from './common.ts';

export type FirebirdBooleanBuilderInitial<TName extends string> = FirebirdBooleanBuilder<{
	name: TName;
	dataType: 'boolean';
	columnType: 'FirebirdBoolean';
	data: boolean;
	driverParam: boolean | number | string;
	enumValues: undefined;
}>;

export class FirebirdBooleanBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'FirebirdBoolean'>>
	extends FirebirdColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'FirebirdBooleanBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'FirebirdBoolean');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdBoolean<MakeColumnConfig<T, TTableName>> {
		return new FirebirdBoolean<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdBoolean<T extends ColumnBaseConfig<'boolean', 'FirebirdBoolean'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdBoolean';

	getSQLType(): string {
		return 'boolean';
	}

	override mapFromDriverValue(value: boolean | number | string): boolean {
		if (typeof value === 'boolean') {
			return value;
		}

		if (typeof value === 'number') {
			return value === 1;
		}

		return value.toLowerCase() === 'true' || value === '1';
	}

	override mapToDriverValue(value: boolean): SQL {
		return sql.raw(value ? 'true' : 'false');
	}
}

export function boolean(): FirebirdBooleanBuilderInitial<''>;
export function boolean<TName extends string>(name: TName): FirebirdBooleanBuilderInitial<TName>;
export function boolean(name?: string) {
	return new FirebirdBooleanBuilder(name ?? '');
}
