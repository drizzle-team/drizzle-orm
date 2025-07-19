import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgTextBuilder<
	TName extends string = string,
	TEnum extends [string, ...string[]] = [string, ...string[]],
> extends PgColumnBuilder<{
		name: TName;
		dataType: 'string';
		data: TEnum[number];
		enumValues: TEnum;
		driverParam: string;
	}, { enumValues: TEnum | undefined }> {
	static override readonly [entityKind]: string = 'PgTextBuilder';

	constructor(
		name: TName,
		config: PgTextConfig<TEnum>,
	) {
		super(name, 'string', 'PgText');
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgText(table, this.config as any);
	}
}

export class PgText extends PgColumn<ColumnBaseConfig<'string'>> {
	static override readonly [entityKind]: string = 'PgText';
	override readonly enumValues

	constructor(
		table: PgTable,
		config: any,
		enumValues?: string[],
	) {
		super(table, config)
		this.enumValues = enumValues
	}

	getSQLType(): string {
		return 'text';
	}
}

export interface PgTextConfig<
	TEnum extends readonly string[] | undefined = readonly string[] | undefined,
> {
	enum?: TEnum;
}

export function text(): PgTextBuilder<''>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: PgTextConfig<T | Writable<T>>,
): PgTextBuilder<'', Writable<T>>;
export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: PgTextConfig<T | Writable<T>>,
): PgTextBuilder<TName, Writable<T>>;
export function text(a?: string | PgTextConfig, b: PgTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<PgTextConfig>(a, b);
	return new PgTextBuilder(name, config as any);
}
