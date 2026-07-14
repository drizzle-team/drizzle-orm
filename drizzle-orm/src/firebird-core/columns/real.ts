import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '~/firebird-core/table.ts';
import { FirebirdColumn, FirebirdColumnBuilder } from './common.ts';

export type FirebirdRealBuilderInitial<TName extends string> = FirebirdRealBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'FirebirdReal';
	data: number;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class FirebirdRealBuilder<T extends ColumnBuilderBaseConfig<'number', 'FirebirdReal'>> extends FirebirdColumnBuilder<
	T,
	{ length: number | undefined }
> {
	static override readonly [entityKind]: string = 'FirebirdRealBuilder';

	constructor(name: T['name'], length?: number) {
		super(name, 'number', 'FirebirdReal');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdReal<MakeColumnConfig<T, TTableName>> {
		return new FirebirdReal<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class FirebirdReal<T extends ColumnBaseConfig<'number', 'FirebirdReal'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdReal';

	constructor(table: AnyFirebirdTable<{ name: T['tableName'] }>, config: FirebirdRealBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'real';
	}

	override mapFromDriverValue = (value: string | number): number => {
		if (typeof value === 'string') {
			return Number.parseFloat(value);
		}
		return value;
	};
}

export function real(): FirebirdRealBuilderInitial<''>;
export function real<TName extends string>(name: TName): FirebirdRealBuilderInitial<TName>;
export function real(name?: string) {
	return new FirebirdRealBuilder(name ?? '');
}
