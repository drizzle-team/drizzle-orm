import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { CheckBuilder } from '~/pg-core/checks.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

// drizzle column type identifier
export const PG_DOMAIN_TYPE = 'PgDomainColumn' as const;
export type PgDomainType = typeof PG_DOMAIN_TYPE;

// Shared base type for the common properties
// we inherit these from the wrapped builder
// this gets used in type ColumnBuilderTypeConfig
type PgDomainColumnBaseConfig<TColumnBase extends PgColumnBuilder<any, any>> = {
	data: TColumnBase['_']['data'];
	notNull: TColumnBase['_']['notNull'];
	hasDefault: TColumnBase['_']['hasDefault'];
	identity: TColumnBase['_']['identity'];
	generated: TColumnBase['_']['generated'];
	checkConstraints: TColumnBase['_']['checkConstraints'];
};

// domain column builder config
// this sets up everything inside ColumnBuilderBaseConfig except for data, driverParam, and enumValues
type PgDomainColumnBuilderConfig<TColumnBase extends PgColumnBuilder<any, any>> =
	& ColumnBuilderBaseConfig<
		TColumnBase['_']['dataType'],
		PgDomainType
	>
	& PgDomainColumnBaseConfig<TColumnBase>;

// domain column config
// extends from the builder config but adds more fields
type PgDomainColumnConfig<TColumnBase extends PgColumnBuilder<any, any>> =
	& ColumnBaseConfig<
		TColumnBase['_']['dataType'],
		PgDomainType
	>
	& PgDomainColumnBaseConfig<TColumnBase>;

// extras that we need at runtime
export type BuilderRuntimeConfig = {
	domain: PgColumn<any, any>;
	domainName: string;
	schema?: string;
};

// domain column builder classa
export class PgDomainColumnBuilder<
	TColumnBuilder extends PgColumnBuilder<any, any>,
	T extends PgDomainColumnBuilderConfig<TColumnBuilder>,
> extends PgColumnBuilder<T, BuilderRuntimeConfig> {
	static override readonly [entityKind]: string = 'PgDomainColumnBuilder';

	// used internally for serialization and introspection
	readonly schema: string | undefined;
	readonly domain: TColumnBuilder;
	readonly domainName: string;
	readonly domainNotNull: boolean;
	readonly domainHasDefault: boolean;
	readonly domainCheckConstraints: CheckBuilder[] | undefined;
	readonly domainType: TColumnBuilder['_']['columnType'];
	readonly domainDefaultValue: TColumnBuilder['default'];

	constructor(name: T['name'], interfaceInstance: PgDomain<TColumnBuilder>) {
		super(name, interfaceInstance.domain.getDataType(), PG_DOMAIN_TYPE);

		// copying over from config for PgDomain interface usage
		this.domainName = interfaceInstance.domainName;
		this.schema = interfaceInstance.schema;
		this.domain = interfaceInstance.domain;

		const domainConfig = this.domain.getConfig();
		this.domainNotNull = domainConfig.notNull;
		this.domainHasDefault = domainConfig.hasDefault;
		this.domainCheckConstraints = domainConfig.checkConstraints;
		this.domainType = domainConfig.dataType;
		this.domainDefaultValue = domainConfig.defaultValue;
	}

	getSQLType(): string {
		return this.domainType;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDomainColumn<TColumnBuilder, MakeColumnConfig<T, TTableName>> {
		const column = this.domain.build(table);

		Object.assign(this.config, {
			domain: column,
			domainName: this.domainName,
			schema: this.config.schema,
		});

		return new PgDomainColumn<TColumnBuilder, MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

// domain column class
export class PgDomainColumn<
	TColumnBuilder extends PgColumnBuilder<any, any>,
	T extends PgDomainColumnConfig<TColumnBuilder>,
> extends PgColumn<T> {
	static override readonly [entityKind]: string = PG_DOMAIN_TYPE;

	// used internally for serialization and introspection
	readonly schema: string | undefined;
	readonly domain: PgColumn<any, any>;
	readonly domainName: string;
	readonly domainNotNull: boolean;
	readonly domainHasDefault: boolean;
	readonly domainCheckConstraints: CheckBuilder[] | undefined;
	readonly domainType: TColumnBuilder['_']['dataType'];
	readonly domainDefaultValue: TColumnBuilder['default'];

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgDomainColumnBuilder<TColumnBuilder, T>['config'],
	) {
		super(table, config);

		// copying over from config for PgDomain interface usage
		this.schema = config.schema;
		this.domain = config.domain;
		this.domainName = config.domainName;
		this.domainNotNull = config.domain.notNull;
		this.domainHasDefault = config.domain.hasDefault;
		this.domainCheckConstraints = config.domain.checkConstraints;
		this.domainType = config.domain.dataType;
		this.domainDefaultValue = config.domain.default;
	}

	getSQLType(): string {
		return this.domainName;
	}
}

const isPgDomainSym = Symbol.for('drizzle:isPgDomain');

// a domain can be accessed before it's a builder (before a column name is passed)
// this is the return value from pgDomain()
// or it can be accessed as a builder (after a column name is passed)
// this is the return value from calling the function returned from pgDomain()
// this interface normalizes the two for ease within the serialization and introspection code
// Note: for domain statements, we want to return the inner column's properties
// for column statements, we want to return the pg domain column's properties
export interface PgDomain<TColumnBuilder extends PgColumnBuilder<any, any>> {
	(name?: string): PgDomainColumnBuilder<TColumnBuilder, PgDomainColumnBuilderConfig<TColumnBuilder>>;

	readonly schema: string | undefined;
	readonly domain: TColumnBuilder;
	readonly domainName: string;
	readonly domainType: TColumnBuilder['_']['columnType'];
	readonly domainNotNull: boolean;
	readonly domainDefaultValue: TColumnBuilder['default'];
	readonly domainCheckConstraints: CheckBuilder[] | undefined;

	/** @internal */
	[isPgDomainSym]: true;
}

// used internally for confirming an object is a PgDomain interface instance
export function isPgDomain(obj: unknown): obj is PgDomain<PgColumnBuilder<any, any>> {
	return !!obj && typeof obj === 'function' && isPgDomainSym in obj && obj[isPgDomainSym] === true;
}

// factory functions
export function pgDomain<TColumnBuilder extends PgColumnBuilder<any, any>>(
	domainName: string,
	columnBuilder: TColumnBuilder,
) {
	return pgDomainWithSchema(domainName, columnBuilder, undefined);
}

/** @internal */
export function pgDomainWithSchema<TColumnBuilder extends PgColumnBuilder<any, any>>(
	domainName: string,
	columnBuilder: TColumnBuilder,
	schema?: string,
) {
	// handy trick to save off the initially passed params and have a unified interface
	// calls to this returned object will need to pass a column name for that particular table
	const instanceWrapper = Object.assign(
		<TName extends string = ''>(name?: TName) =>
			new PgDomainColumnBuilder<TColumnBuilder, PgDomainColumnBuilderConfig<TColumnBuilder>>(
				name ?? '' as TName,
				instanceWrapper,
			),
		{
			schema,
			domain: columnBuilder,
			domainName,
			domainType: columnBuilder.getSQLType(),
			domainNotNull: columnBuilder.getConfig().notNull,
			domainDefaultValue: columnBuilder.getConfig().default,
			domainCheckConstraints: columnBuilder.getConfig().checkConstraints,
			[isPgDomainSym]: true,
		} as const,
	) as PgDomain<TColumnBuilder>;

	return instanceWrapper;
}
