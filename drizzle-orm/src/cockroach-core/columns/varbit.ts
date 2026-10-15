import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, type CockroachColumnBaseConfig, CockroachColumnBuilder } from './common.ts';

export class CockroachVarbitBuilder extends CockroachColumnBuilder<{
	dataType: 'string binary';
	data: string;
	driverParam: string;
}, { length: number | undefined }> {
	static override readonly [entityKind]: string = 'CockroachVarbitBuilder';

	constructor(name: string, config: CockroachVarbitConfig) {
		super(name, 'string binary', 'CockroachVarbit');
		this.config.length = config.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachVarbit(
			table,
			this.config,
		);
	}
}

export class CockroachVarbit<T extends CockroachColumnBaseConfig<'string binary'>>
	extends CockroachColumn<'string binary', T, { length: number | undefined }>
{
	static override readonly [entityKind]: string = 'CockroachVarbit';

	/** @internal */
	override readonly codec = 'varbit';

	getSQLType(): string {
		return this.length ? `varbit(${this.length})` : 'varbit';
	}
}

export interface CockroachVarbitConfig {
	length?: number | undefined;
}

export function varbit(
	config?: CockroachVarbitConfig,
): CockroachVarbitBuilder;
export function varbit(
	name: string,
	config?: CockroachVarbitConfig,
): CockroachVarbitBuilder;
export function varbit(a?: string | CockroachVarbitConfig, b: CockroachVarbitConfig = {}) {
	const { name, config } = getColumnNameAndConfig<CockroachVarbitConfig>(a, b);
	return new CockroachVarbitBuilder(name, config);
}
