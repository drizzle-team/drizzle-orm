import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgJsonbBuilderInitial<TName extends string> = PgJsonbBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'PgJsonb';
	data: unknown;
	driverParam: unknown;
	enumValues: undefined;
}>;

export class PgJsonbBuilder<T extends ColumnBuilderBaseConfig<'json', 'PgJsonb'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgJsonbBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'PgJsonb');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgJsonb<MakeColumnConfig<T, TTableName>> {
		return new PgJsonb<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgJsonb<T extends ColumnBaseConfig<'json', 'PgJsonb'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgJsonb';

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgJsonbBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'jsonb';
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}

	override mapFromDriverValue(value: T['data'] | string): T['data'] {
		// The pg driver automatically parses JSON/JSONB columns via JSON.parse.
		// When the JSON value is a string (e.g., `"hello"` or `"0.1"`), the driver
		// returns it as a JavaScript string. We must NOT call JSON.parse again here,
		// as that would incorrectly convert JSON strings like `"0.1"` to numbers.
		//
		// For objects, arrays, numbers, booleans, and null - the driver already
		// returns the correct JavaScript type.
		//
		// If the driver returns a raw JSON string (e.g., when type parsing is disabled),
		// it will start with `{`, `[`, or `"`, which we can detect and parse.
		if (typeof value === 'string' && value.length > 0) {
			const firstChar = value[0];
			if (firstChar === '{' || firstChar === '[') {
				// Raw JSON object or array - parse it
				try {
					return JSON.parse(value);
				} catch {
					return value as T['data'];
				}
			}
			// For strings starting with `"`, the pg driver already parsed the outer
			// quotes and returned the inner string value. For strings starting with
			// other chars (numbers as strings like "0.1", "true", "null"), these are
			// the actual JSON string values after driver parsing, so return as-is.
		}
		return value;
	}
}

export function jsonb(): PgJsonbBuilderInitial<''>;
export function jsonb<TName extends string>(name: TName): PgJsonbBuilderInitial<TName>;
export function jsonb(name?: string) {
	return new PgJsonbBuilder(name ?? '');
}
