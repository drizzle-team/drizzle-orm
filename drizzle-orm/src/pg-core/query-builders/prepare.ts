import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgBasePreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { SQL } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

/**
 * Prepares an insert, update or delete on the session, for both runtimes: the session decides what the prepared
 * query's `execute` returns. Rows of `returning` are mapped by the driver's shape when it has one, by a row mapper
 * otherwise; without `returning` the driver's raw result comes back
 */
export function prepareMutation(
	session: PgSession,
	dialect: PgDialect,
	config: { returning?: SelectedFieldsOrdered; shape?: any },
	getSQL: () => SQL,
	nullableObjectPaths: Parameters<PgDialect['mapperGenerators']['rows']>[1],
	name: string | boolean,
): PgBasePreparedQuery {
	const { returning: fields } = config;

	return tracer.startActiveSpan('drizzle.prepareQuery', () => {
		const shape = fields
			? config.shape ??= dialect.shapeGenerator?.({ type: 'plain', fields }, nullableObjectPaths)
			: undefined;

		const query = dialect.sqlToQuery(getSQL());
		const mapper = shape || !fields
			? undefined
			: dialect.mapperGenerators.rows(fields, nullableObjectPaths);

		return session.prepareQuery(
			query,
			shape ? 'objects' : fields ? 'arrays' : 'raw',
			name,
			mapper as ((rows: unknown[]) => any) | undefined,
			shape,
		);
	});
}
