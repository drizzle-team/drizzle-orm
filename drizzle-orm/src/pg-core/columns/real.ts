import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgRealBuilderInitial<TName extends string> = PgRealBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'PgReal';
	data: number;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class PgRealBuilder<T extends ColumnBuilderBaseConfig<'number', 'PgReal'>> extends PgColumnBuilder<
	T,
	{ length: number | undefined }
> {
	static override readonly [entityKind]: string = 'PgRealBuilder';

	constructor(name: T['name'], length?: number) {
		super(name, 'number', 'PgReal');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgReal<MakeColumnConfig<T, TTableName>> {
		return new PgReal<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgReal<T extends ColumnBaseConfig<'number', 'PgReal'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgReal';

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgRealBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'real';
	}

	override mapFromDriverValue = (value: string | number): number => {
		if (typeof value === 'string') {
			return Number.parseFloat(value);
		}
		return value;
	};
}

export function real(): PgRealBuilderInitial<''>;
export function real<TName extends string>(name: TName): PgRealBuilderInitial<TName>;
export function real(name?: string) {
	return new PgRealBuilder(name ?? '');
}
