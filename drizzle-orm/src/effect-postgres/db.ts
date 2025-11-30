import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectCountBuilder } from '~/pg-core/effect/count.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { PgViewBase } from '~/pg-core/view-base.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { EffectPgSession } from './session.ts';

export class EffectPgDatabase // TODO:
// TFullSchema extends Record<string, unknown> = Record<string, never>,
// TRelations extends AnyRelations = EmptyRelations,
// TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
{
	static readonly [entityKind]: string = 'EffectPgDatabase';

	constructor(
		/** @internal */
		readonly dialect: PgDialect,
		/** @internal */
		readonly session: EffectPgSession<any, any>,
		// TODO:
		// relations: TRelations,
		// schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		// parseRqbJson: boolean = false,
	) {
	}

	$count(
		source: PgTable | PgViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	) {
		return new PgEffectCountBuilder({ source, filters, session: this.session });
	}
}
