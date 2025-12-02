import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export class MsSqlFloatBuilder extends MsSqlColumnBuilderWithIdentity<{
	dataType: 'number double';
	data: number;
	driverParam: number;
}, MsSqlFloatConfig> {
	static override readonly [entityKind]: string = 'MsSqlFloatBuilder';

	constructor(name: string, config?: MsSqlFloatConfig) {
		super(name, 'number double', 'MsSqlFloat');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlFloat(table, this.config);
	}
}

export class MsSqlFloat<T extends ColumnBaseConfig<'number double'>>
	extends MsSqlColumnWithIdentity<T, MsSqlFloatConfig>
{
	static override readonly [entityKind]: string = 'MsSqlFloat';

	readonly precision: number | undefined = this.config.precision;

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `float${precision}`;
	}
}

export interface MsSqlFloatConfig {
	precision?: number;
}

export function float(
	config?: MsSqlFloatConfig,
): MsSqlFloatBuilder;
export function float(
	name: string,
	config?: MsSqlFloatConfig,
): MsSqlFloatBuilder;
export function float(a?: string | MsSqlFloatConfig, b: MsSqlFloatConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MsSqlFloatConfig>(a, b);
	return new MsSqlFloatBuilder(name, config);
}
