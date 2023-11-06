import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	IsIdentityByDefault,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import type { AnyPgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder, type PgGeneratedColumnConfig } from './common.ts';

type PgIntegerBuilderInitial<TName extends string> = PgIntegerBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'PgInteger';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgIntegerBuilder<T extends ColumnBuilderBaseConfig<'number', 'PgInteger'>> extends PgColumnBuilder<T> {
	static readonly [entityKind]: string = 'PgIntegerBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'PgInteger');
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
	): PgInteger<MakeColumnConfig<T, TTableName>> {
		return new PgInteger<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgInteger<T extends ColumnBaseConfig<'number', 'PgInteger'>> extends PgColumn<T> {
	static readonly [entityKind]: string = 'PgInteger';

	getSQLType(): string {
		return 'integer';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number.parseInt(value);
		}
		return value;
	}
}

export function integer<TName extends string>(name: TName): PgIntegerBuilderInitial<TName> {
	return new PgIntegerBuilder(name);
}
