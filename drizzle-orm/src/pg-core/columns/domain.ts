import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgDomainColumnBuilderInitial<TName extends string, TType extends ColumnDataType> = PgDomainColumnBuilder<{
	name: TName;
	dataType: TType;
	columnType: 'PgDomainColumn';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

const isPgDomainSym = Symbol.for('drizzle:isPgDomain');
export interface PgDomain<TType extends ColumnDataType> {
	(): PgDomainColumnBuilderInitial<'', TType>;
	<TName extends string>(name: TName): PgDomainColumnBuilderInitial<TName, TType>;
	<TName extends string>(name?: TName): PgDomainColumnBuilderInitial<TName, TType>;

	readonly domainName: string;
	readonly domainType: TType;
	readonly schema: string | undefined;
	/** @internal */
	[isPgDomainSym]: true;
}

export function isPgDomain(obj: unknown): obj is PgDomain<ColumnDataType> {
	return !!obj && typeof obj === 'function' && isPgDomainSym in obj && obj[isPgDomainSym] === true;
}

export class PgDomainColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, 'PgDomainColumn'>,
> extends PgColumnBuilder<T, { domain: PgDomain<T['dataType']> }> {
	static override readonly [entityKind]: string = 'PgDomainColumnBuilder';

	constructor(name: T['name'], domainInstance: PgDomain<T['dataType']>) {
		super(name, domainInstance.domainType, 'PgDomainColumn');
		this.config.domain = domainInstance;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDomainColumn<MakeColumnConfig<T, TTableName>> {
		return new PgDomainColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgDomainColumn<T extends ColumnBaseConfig<ColumnDataType, 'PgDomainColumn'>>
	extends PgColumn<T, { domain: PgDomain<T['dataType']> }>
{
	static override readonly [entityKind]: string = 'PgDomainColumn';

	readonly domain = this.config.domain;
	readonly domainType = this.config.domain.domainType;

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgDomainColumnBuilder<T>['config'],
	) {
		super(table, config);
		this.domain = config.domain;
	}

	getSQLType(): string {
		return this.domain.domainName;
	}
}

export function pgDomain<TType extends ColumnDataType>(
	domainName: string,
	domainType: TType,
): PgDomain<TType> {
	return pgDomainWithSchema(domainName, domainType, undefined);
}

/** @internal */
export function pgDomainWithSchema<TType extends ColumnDataType>(
	domainName: string,
	domainType: TType,
	schema?: string,
): PgDomain<TType> {
	const domainInstance: PgDomain<TType> = Object.assign(
		<TName extends string>(name?: TName): PgDomainColumnBuilderInitial<TName, TType> =>
			new PgDomainColumnBuilder(name ?? '' as TName, domainInstance),
		{
			domainName,
			domainType,
			schema,
			[isPgDomainSym]: true,
		} as const,
	);

	return domainInstance;
}
