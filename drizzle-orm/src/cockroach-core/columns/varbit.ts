import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachVarbitBuilderInitial<TName extends string, TLength extends number | undefined> =
	CockroachVarbitBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'CockroachVarbit';
		data: string;
		driverParam: string;
		enumValues: undefined;
		length: TLength;
	}>;

export class CockroachVarbitBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachVarbit'> & { length?: number },
> extends CockroachColumnWithArrayBuilder<T, { length: T['length'] }> {
	static override readonly [entityKind]: string = 'CockroachVarbitBuilder';

	constructor(name: string, config: CockroachVarbitConfig<T['length']>) {
		super(name, 'string', 'CockroachVarbit');
		this.config.length = config.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachVarbit<MakeColumnConfig<T, TTableName> & { length?: T['length'] }> {
		return new CockroachVarbit<MakeColumnConfig<T, TTableName> & { length?: T['length'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachVarbit<T extends ColumnBaseConfig<'string', 'CockroachVarbit'> & { length?: number }>
	extends CockroachColumn<T, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'CockroachVarbit';

	readonly length = this.config.length;

	getSQLType(): string {
		return this.length ? `varbit(${this.length})` : 'varbit';
	}
}

export interface CockroachVarbitConfig<TLength extends number | undefined = number | undefined> {
	length?: TLength;
}

export function varbit(): CockroachVarbitBuilderInitial<'', undefined>;
export function varbit<D extends number | undefined>(
	config?: CockroachVarbitConfig<D>,
): CockroachVarbitBuilderInitial<'', D>;
export function varbit<TName extends string, D extends number | undefined>(
	name: TName,
	config?: CockroachVarbitConfig<D>,
): CockroachVarbitBuilderInitial<TName, D>;
export function varbit(a?: string | CockroachVarbitConfig, b: CockroachVarbitConfig = {}) {
	const { name, config } = getColumnNameAndConfig<CockroachVarbitConfig>(a, b);
	return new CockroachVarbitBuilder(name, config);
}
