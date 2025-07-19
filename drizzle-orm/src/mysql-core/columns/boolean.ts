import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlBooleanBuilderInitial<TName extends string> = MySqlBooleanBuilder<{
	name: TName;
	dataType: 'boolean';
	data: boolean;
	driverParam: number | boolean;
	enumValues: undefined;
}>;

export class MySqlBooleanBuilder<T extends ColumnBuilderBaseConfig<'boolean'>>
	extends MySqlColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'MySqlBooleanBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'MySqlBoolean');
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlBoolean(
			table,
			this.config as any,
		);
	}
}

export class MySqlBoolean<T extends ColumnBaseConfig<'boolean'>> extends MySqlColumn<T> {
	static override readonly [entityKind]: string = 'MySqlBoolean';

	getSQLType(): string {
		return 'boolean';
	}

	override mapFromDriverValue(value: number | boolean): boolean {
		if (typeof value === 'boolean') {
			return value;
		}
		return value === 1;
	}
}

export function boolean(): MySqlBooleanBuilderInitial<''>;
export function boolean<TName extends string>(name: TName): MySqlBooleanBuilderInitial<TName>;
export function boolean(name?: string) {
	return new MySqlBooleanBuilder(name ?? '');
}
