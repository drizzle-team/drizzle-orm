import type {
	ColumnBuilderBaseConfig,
	HasDefault,
	NotNull,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import type {  PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgBigSerial53BuilderInitial<TName extends string> = NotNull<
	HasDefault<
		PgBigSerial53Builder<{
			name: TName;
			dataType: 'number';
			columnType: 'PgBigSerial53';
			data: number;
			driverParam: number;
			enumValues: undefined;
		}>
	>
>;

export class PgBigSerial53Builder<T extends ColumnBuilderBaseConfig<'number'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgBigSerial53Builder';

	constructor(name: string) {
		super(name, 'number', 'PgBigSerial53');
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgBigSerial53(
			table,
			this.config as any,
		);
	}
}

export class PgBigSerial53<T extends ColumnBaseConfig<'number'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgBigSerial53';

	getSQLType(): string {
		return 'bigserial';
	}

	override mapFromDriverValue(value: number): number {
		if (typeof value === 'number') {
			return value;
		}
		return Number(value);
	}
}

export type PgBigSerial64BuilderInitial<TName extends string> = NotNull<
	HasDefault<
		PgBigSerial64Builder<{
			name: TName;
			dataType: 'bigint';
			columnType: 'PgBigSerial64';
			data: bigint;
			driverParam: string;
			enumValues: undefined;
		}>
	>
>;

export class PgBigSerial64Builder<T extends ColumnBuilderBaseConfig<'bigint'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgBigSerial64Builder';

	constructor(name: string) {
		super(name, 'bigint', 'PgBigSerial64');
		this.config.hasDefault = true;
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgBigSerial64(
			table,
			this.config as any,
		);
	}
}

export class PgBigSerial64<T extends ColumnBaseConfig<'bigint'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgBigSerial64';

	getSQLType(): string {
		return 'bigserial';
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

export interface PgBigSerialConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function bigserial<TMode extends PgBigSerialConfig['mode']>(
	config: PgBigSerialConfig<TMode>,
): TMode extends 'number' ? PgBigSerial53BuilderInitial<''> : PgBigSerial64BuilderInitial<''>;
export function bigserial<TName extends string, TMode extends PgBigSerialConfig['mode']>(
	name: TName,
	config: PgBigSerialConfig<TMode>,
): TMode extends 'number' ? PgBigSerial53BuilderInitial<TName> : PgBigSerial64BuilderInitial<TName>;
export function bigserial(a: string | PgBigSerialConfig, b?: PgBigSerialConfig) {
	const { name, config } = getColumnNameAndConfig<PgBigSerialConfig>(a, b);
	if (config.mode === 'number') {
		return new PgBigSerial53Builder(name);
	}
	return new PgBigSerial64Builder(name);
}
