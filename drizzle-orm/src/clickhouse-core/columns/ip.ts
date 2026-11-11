import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { castFromString } from '../literals.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder } from './common.ts';

export type ClickHouseIpTypeName = 'IPv4' | 'IPv6';

interface ClickHouseIpRuntimeConfig {
	chType: ClickHouseIpTypeName;
}

export type ClickHouseIpBuilderInitial<TName extends string, TColumnType extends string> = ClickHouseIpBuilder<{
	name: TName;
	dataType: 'string';
	columnType: TColumnType;
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class ClickHouseIpBuilder<T extends ColumnBuilderBaseConfig<'string', string>>
	extends ClickHouseColumnBuilder<T, ClickHouseIpRuntimeConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseIpBuilder';

	constructor(name: T['name'], columnType: T['columnType'], chType: ClickHouseIpTypeName) {
		super(name, 'string', columnType);
		this.config.chType = chType;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseIp<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseIp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseIp<T extends ColumnBaseConfig<'string', string>>
	extends ClickHouseColumn<T, ClickHouseIpRuntimeConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseIp';

	readonly chType: ClickHouseIpTypeName = this.config.chType;

	getBaseSQLType(): string {
		return this.chType;
	}

	override mapToDriverValue(value: string): SQL {
		return castFromString(this.chType === 'IPv4' ? 'toIPv4' : 'toIPv6', value);
	}
}

function ipFactory<TColumnType extends string>(columnType: TColumnType, chType: ClickHouseIpTypeName) {
	function column(): ClickHouseIpBuilderInitial<'', TColumnType>;
	function column<TName extends string>(name: TName): ClickHouseIpBuilderInitial<TName, TColumnType>;
	function column(name?: string) {
		return new ClickHouseIpBuilder(name ?? '', columnType, chType);
	}
	return column;
}

/** `IPv4` — a 4-byte IPv4 address, surfaced as its dotted-quad string form. */
export const ipv4 = ipFactory('ClickHouseIPv4', 'IPv4');

/** `IPv6` — a 16-byte IPv6 address, surfaced as its canonical string form. */
export const ipv6 = ipFactory('ClickHouseIPv6', 'IPv6');
