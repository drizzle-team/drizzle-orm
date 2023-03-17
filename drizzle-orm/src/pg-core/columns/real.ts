import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgRealBuilder extends PgColumnBuilder<
	ColumnBuilderConfig<{ data: number; driverParam: string | number }>,
	{ length: number | undefined }
> {
	protected override $pgColumnBuilderBrand!: 'PgRealBuilder';

	constructor(name: string, length?: number) {
		super(name);
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgReal<TTableName> {
		return new PgReal(table, this.config);
	}
}

export class PgReal<TTableName extends string> extends PgColumn<
	ColumnConfig<{ tableName: TTableName; data: number; driverParam: string | number }>
> {
	protected override $pgColumnBrand!: 'PgReal';

	constructor(table: AnyPgTable<{ name: TTableName }>, config: PgRealBuilder['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'real';
	}

	override mapFromDriverValue = (value: string | number): number => {
		if (typeof value === 'string') {
			return parseFloat(value);
		}
		return value;
	};
}

export function real(name: string) {
	return new PgRealBuilder(name);
}
