import { renderWithTask } from 'hanji';
import { Minimatch } from 'minimatch';
import { originUUID } from '../../global';
import type { PgSchema, PgSchemaInternal } from '../../serializer/pgSchema';
import { fromDatabase } from '../../serializer/pgSerializer';
import type { DB } from '../../utils';
import { Entities } from '../validations/cli';
import { ProgressView } from '../views';

export const pgPushIntrospect = async (
	db: DB,
	filters: string[],
	schemaFilters: string[],
	entities: Entities,
	tsSchema?: PgSchemaInternal,
) => {
	const matchers = filters.map((it) => {
		return new Minimatch(it);
	});

	const filter = (tableName: string) => {
		if (matchers.length === 0) return true;

		let flags: boolean[] = [];

		for (let matcher of matchers) {
			if (matcher.negate) {
				if (!matcher.match(tableName)) {
					flags.push(false);
				}
			}

			if (matcher.match(tableName)) {
				flags.push(true);
			}
		}

		if (flags.length > 0) {
			return flags.every(Boolean);
		}
		return false;
	};
	const progress = new ProgressView(
		'Pulling schema from database...',
		'Pulling schema from database...',
	);
	const res = await renderWithTask(
		progress,
		fromDatabase(db, filter, schemaFilters, entities, undefined, tsSchema),
	);

	const schema = { id: originUUID, prevId: '', ...res } as PgSchema;
	const { internal, ...schemaWithoutInternals } = schema;
	return { schema: schemaWithoutInternals };
};
