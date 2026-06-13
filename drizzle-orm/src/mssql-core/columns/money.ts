import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export class MsSqlMoneyBuilder extends MsSqlColumnBuilderWithIdentity<{
	dataType: 'string numeric';
	data: string;
	driverParam: string;
}, MsSqlMoneyConfig> {
	static override readonly [entityKind]: string = 'MsSqlMoneyBuilder';

	constructor(name: string, config: MsSqlMoneyConfig | undefined) {
		super(name, 'string numeric', 'MsSqlMoney');
		this.config.kind = config?.kind ?? 'money';
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlMoney(table, this.config);
	}
}

export class MsSqlMoney<T extends ColumnBaseConfig<'string numeric'>>
	extends MsSqlColumnWithIdentity<T, MsSqlMoneyConfig>
{
	static override readonly [entityKind]: string = 'MsSqlMoney';

	readonly kind: 'money' | 'smallmoney' = this.config.kind ?? 'money';

	override mapFromDriverValue = (value: unknown): string => {
		if (typeof value === 'string') return value;

		return String(value);
	};

	getSQLType(): string {
		return this.kind;
	}
}

export class MsSqlMoneyNumberBuilder extends MsSqlColumnBuilderWithIdentity<{
	dataType: 'number';
	data: number;
	driverParam: string;
}, MsSqlMoneyConfig> {
	static override readonly [entityKind]: string = 'MsSqlMoneyNumberBuilder';

	constructor(name: string, config: MsSqlMoneyConfig | undefined) {
		super(name, 'number', 'MsSqlMoneyNumber');
		this.config.kind = config?.kind ?? 'money';
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlMoneyNumber(table, this.config);
	}
}

export class MsSqlMoneyNumber<T extends ColumnBaseConfig<'number'>>
	extends MsSqlColumnWithIdentity<T, MsSqlMoneyConfig>
{
	static override readonly [entityKind]: string = 'MsSqlMoneyNumber';

	readonly kind: 'money' | 'smallmoney' = this.config.kind ?? 'money';

	override mapFromDriverValue = (value: unknown): number => {
		if (typeof value === 'number') return value;

		return Number(value);
	};

	override mapToDriverValue = String;

	getSQLType(): string {
		return this.kind;
	}
}

export interface MsSqlMoneyConfig<TMode extends 'string' | 'number' = 'string' | 'number'> {
	mode?: TMode;
	kind?: 'money' | 'smallmoney';
}

export function money<TMode extends 'string' | 'number'>(
	config?: Omit<MsSqlMoneyConfig<TMode>, 'kind'>,
): Equal<TMode, 'number'> extends true ? MsSqlMoneyNumberBuilder : MsSqlMoneyBuilder;
export function money<TMode extends 'string' | 'number'>(
	name: string,
	config?: Omit<MsSqlMoneyConfig<TMode>, 'kind'>,
): Equal<TMode, 'number'> extends true ? MsSqlMoneyNumberBuilder : MsSqlMoneyBuilder;
export function money(a?: string | Omit<MsSqlMoneyConfig, 'kind'>, b?: Omit<MsSqlMoneyConfig, 'kind'>) {
	const { name, config } = getColumnNameAndConfig<Omit<MsSqlMoneyConfig, 'kind'>>(a, b);
	const moneyConfig = { ...config, kind: 'money' } as const;
	return moneyConfig.mode === 'number'
		? new MsSqlMoneyNumberBuilder(name, moneyConfig)
		: new MsSqlMoneyBuilder(name, moneyConfig);
}

export function smallmoney<TMode extends 'string' | 'number'>(
	config?: Omit<MsSqlMoneyConfig<TMode>, 'kind'>,
): Equal<TMode, 'number'> extends true ? MsSqlMoneyNumberBuilder : MsSqlMoneyBuilder;
export function smallmoney<TMode extends 'string' | 'number'>(
	name: string,
	config?: Omit<MsSqlMoneyConfig<TMode>, 'kind'>,
): Equal<TMode, 'number'> extends true ? MsSqlMoneyNumberBuilder : MsSqlMoneyBuilder;
export function smallmoney(a?: string | Omit<MsSqlMoneyConfig, 'kind'>, b?: Omit<MsSqlMoneyConfig, 'kind'>) {
	const { name, config } = getColumnNameAndConfig<Omit<MsSqlMoneyConfig, 'kind'>>(a, b);
	const moneyConfig = { ...config, kind: 'smallmoney' } as const;
	return moneyConfig.mode === 'number'
		? new MsSqlMoneyNumberBuilder(name, moneyConfig)
		: new MsSqlMoneyBuilder(name, moneyConfig);
}
