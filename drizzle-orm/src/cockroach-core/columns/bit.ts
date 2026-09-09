import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, type CockroachColumnBaseConfig, CockroachColumnBuilder } from './common.ts';

export class CockroachBitBuilder extends CockroachColumnBuilder<{
	dataType: 'string binary';
	data: string;
	driverParam: string;
}, { length: number | undefined; setLength: boolean; isLengthExact: true }> {
	static override readonly [entityKind]: string = 'CockroachBitBuilder';

	constructor(name: string, config: CockroachBitConfig) {
		super(name, 'string binary', 'CockroachBit');
		this.config.length = config.length ?? 1;
		this.config.setLength = config.length !== undefined;
		this.config.isLengthExact = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachBit(
			table,
			this.config,
		);
	}
}

export class CockroachBit<T extends CockroachColumnBaseConfig<'string binary'> & { length?: number }>
	extends CockroachColumn<'string binary', T, { length: T['length']; setLength: boolean }>
{
	static override readonly [entityKind]: string = 'CockroachBit';

	/** @internal */
	override readonly codec = 'bit';

	getSQLType(): string {
		return this.config.setLength ? `bit(${this.length})` : 'bit';
	}
}

export interface CockroachBitConfig {
	length?: number | undefined;
}

export function bit(config?: CockroachBitConfig): CockroachBitBuilder;
export function bit(
	name: string,
	config?: CockroachBitConfig,
): CockroachBitBuilder;
export function bit(a?: string | CockroachBitConfig, b: CockroachBitConfig = {}) {
	const { name, config } = getColumnNameAndConfig<CockroachBitConfig>(a, b);
	return new CockroachBitBuilder(name, config);
}
