import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable, PgTable } from '~/pg-core/table.ts';
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
	override build(table: PgTable) {
		return new PgReal(table, this.config as any);
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
