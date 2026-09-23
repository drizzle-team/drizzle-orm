import 'dotenv/config';

export const dsqlUrl = () => {
	const url = process.env['DSQL_CONNECTION_STRING'];
	if (!url) {
		throw new Error(
			'DSQL_CONNECTION_STRING is not set. Point it at an Aurora DSQL cluster: postgresql://admin@<cluster>.dsql.<region>.on.aws:5432/postgres',
		);
	}

	const parsed = new URL(url);
	parsed.password = '';
	return parsed.toString();
};
