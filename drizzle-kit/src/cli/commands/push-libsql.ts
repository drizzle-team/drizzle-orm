import type { EntitiesFilterConfig } from '../validations/cli';
import type { CasingType } from '../validations/common';
import type { LibSQLCredentials } from '../validations/libsql';
import { handle as sqliteHandle } from './push-sqlite';

export const handle = async (
	schemaPath: string | string[],
	verbose: boolean,
	credentials: LibSQLCredentials,
	filters: EntitiesFilterConfig,
	force: boolean,
	casing: CasingType | undefined,
	explainFlag: boolean,
) => {
	const { connectToLibSQL } = await import('../connections');
	const db = await connectToLibSQL(credentials);
	return sqliteHandle(schemaPath, verbose, credentials, filters, force, casing, explainFlag, db);
};
