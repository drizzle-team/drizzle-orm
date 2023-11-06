import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	IsIdentityByDefault,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import { PgColumn, PgColumnBuilder, type PgGeneratedColumnConfig } from './common.ts';

export type PgSmallIntBuilderInitial<TName extends string> = PgSmallIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'PgSmallInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgSmallIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'PgSmallInt'>> extends PgColumnBuilder<T> {
	static readonly [entityKind]: string = 'PgSmallIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'PgSmallInt');
	}

	generatedAsIdentity<TType extends 'always' | 'byDefault'>(
		config?: PgGeneratedColumnConfig<TType> & { sequenceOpts?: SQL },
	): IsIdentityByDefault<this, TType> {
		this.config.generated = {
			as: sql`identity${config?.sequenceOpts ? ` ${config.sequenceOpts}` : ''}`,
			type: config?.type ?? 'always',
		};
		return this as any;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgSmallInt<MakeColumnConfig<T, TTableName>> {
		return new PgSmallInt<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgSmallInt<T extends ColumnBaseConfig<'number', 'PgSmallInt'>> extends PgColumn<T> {
	static readonly [entityKind]: string = 'PgSmallInt';

	getSQLType(): string {
		return 'smallint';
	}

	override mapFromDriverValue = (value: number | string): number => {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	};
}

export function smallint<TName extends string>(name: TName): PgSmallIntBuilderInitial<TName> {
	return new PgSmallIntBuilder(name);
}
