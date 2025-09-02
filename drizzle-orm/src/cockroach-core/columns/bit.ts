import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachBitBuilderInitial<TName extends string, TLength extends number | undefined> = CockroachBitBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachBit';
	data: string;
	driverParam: string;
	enumValues: undefined;
	length: TLength;
}>;

export class CockroachBitBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachBit'> & { length?: number }>
	extends CockroachColumnWithArrayBuilder<T, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'CockroachBitBuilder';

	constructor(name: string, config: CockroachBitConfig<T['length']>) {
		super(name, 'string', 'CockroachBit');
		this.config.length = config.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachBit<MakeColumnConfig<T, TTableName> & { length?: T['length'] }> {
		return new CockroachBit<MakeColumnConfig<T, TTableName> & { length?: T['length'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachBit<T extends ColumnBaseConfig<'string', 'CockroachBit'> & { length?: number }>
	extends CockroachColumn<T, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'CockroachBit';

	readonly length = this.config.length;

	getSQLType(): string {
		return this.length ? `bit(${this.length})` : 'bit';
	}
}

export interface CockroachBitConfig<TLength extends number | undefined = number | undefined> {
	length?: TLength;
}

export function bit(): CockroachBitBuilderInitial<'', undefined>;
export function bit<D extends number | undefined>(config?: CockroachBitConfig<D>): CockroachBitBuilderInitial<'', D>;
export function bit<TName extends string, D extends number | undefined>(
	name: TName,
	config?: CockroachBitConfig<D>,
): CockroachBitBuilderInitial<TName, D>;
export function bit(a?: string | CockroachBitConfig, b: CockroachBitConfig = {}) {
	const { name, config } = getColumnNameAndConfig<CockroachBitConfig>(a, b);
	return new CockroachBitBuilder(name, config);
}
