import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn } from './common.ts';
import { PgDateColumnBuilder } from './date.common.ts';

export class PgDateBuilder extends PgDateColumnBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'PgDateBuilder';

	constructor(name: string) {
		super(name, 'object date', 'PgDate');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgDate(table, this.config as any);
	}
}

export class PgDate extends PgColumn<'object date'> {
	static override readonly [entityKind]: string = 'PgDate';

	getSQLType(): string {
		return 'date';
	}

	override mapFromDriverValue(value: string | Date): Date {
		if (typeof value === 'string') return new Date(value);
		return value;
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString();
	}
}

export class PgDateStringBuilder extends PgDateColumnBuilder<{
	dataType: 'string date';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'PgDateStringBuilder';

	constructor(name: string) {
		super(name, 'string date', 'PgDateString');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgDateString(
			table,
			this.config as any,
		);
	}
}

export class PgDateString extends PgColumn<'string date'> {
	static override readonly [entityKind]: string = 'PgDateString';

	getSQLType(): string {
		return 'date';
	}

	override mapFromDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString().slice(0, -14);
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString();
	}
}

export interface PgDateConfig<T extends 'date' | 'string' = 'date' | 'string'> {
	mode: T;
}

export function date<TMode extends PgDateConfig['mode'] & {}>(
	config?: PgDateConfig<TMode>,
): Equal<TMode, 'date'> extends true ? PgDateBuilder : PgDateStringBuilder;
export function date<TMode extends PgDateConfig['mode'] & {}>(
	name: string,
	config?: PgDateConfig<TMode>,
): Equal<TMode, 'date'> extends true ? PgDateBuilder : PgDateStringBuilder;
export function date(a?: string | PgDateConfig, b?: PgDateConfig) {
	const { name, config } = getColumnNameAndConfig<PgDateConfig>(a, b);
	if (config?.mode === 'date') {
		return new PgDateBuilder(name);
	}
	return new PgDateStringBuilder(name);
}
