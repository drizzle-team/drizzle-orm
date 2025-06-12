import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachRealBuilderInitial<TName extends string> = CockroachRealBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachReal';
	data: number;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class CockroachRealBuilder<T extends ColumnBuilderBaseConfig<'number', 'CockroachReal'>>
	extends CockroachColumnWithArrayBuilder<
		T,
		{ length: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'CockroachRealBuilder';

	constructor(name: T['name'], length?: number) {
		super(name, 'number', 'CockroachReal');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachReal<MakeColumnConfig<T, TTableName>> {
		return new CockroachReal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachReal<T extends ColumnBaseConfig<'number', 'CockroachReal'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachReal';

	constructor(table: AnyCockroachTable<{ name: T['tableName'] }>, config: CockroachRealBuilder<T>['config']) {
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

export function real(): CockroachRealBuilderInitial<''>;
export function real<TName extends string>(name: TName): CockroachRealBuilderInitial<TName>;
export function real(name?: string) {
	return new CockroachRealBuilder(name ?? '');
}
