import 'dotenv/config';
import { requireEnv } from '@drizzle-team/test-utils';

export const dsqlUrl = () => {
	const url = requireEnv(
		'DSQL_CONNECTION_STRING',
		'Point it at an Aurora DSQL cluster: postgresql://admin@<cluster>.dsql.<region>.on.aws:5432/postgres',
	);

	const parsed = new URL(url);
	parsed.password = '';
	return parsed.toString();
};
