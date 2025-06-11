import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from './common.ts';

export type CockroachDbRealBuilderInitial<TName extends string> = CockroachDbRealBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachDbReal';
	data: number;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class CockroachDbRealBuilder<T extends ColumnBuilderBaseConfig<'number', 'CockroachDbReal'>>
	extends CockroachDbColumnWithArrayBuilder<
		T,
		{ length: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'CockroachDbRealBuilder';

	constructor(name: T['name'], length?: number) {
		super(name, 'number', 'CockroachDbReal');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbReal<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbReal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbReal<T extends ColumnBaseConfig<'number', 'CockroachDbReal'>> extends CockroachDbColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDbReal';

	constructor(table: AnyCockroachDbTable<{ name: T['tableName'] }>, config: CockroachDbRealBuilder<T>['config']) {
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

export function real(): CockroachDbRealBuilderInitial<''>;
export function real<TName extends string>(name: TName): CockroachDbRealBuilderInitial<TName>;
export function real(name?: string) {
	return new CockroachDbRealBuilder(name ?? '');
}
