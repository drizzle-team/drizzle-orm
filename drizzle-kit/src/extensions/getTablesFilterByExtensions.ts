import type { Config } from '../index';

export const getTablesFilterByExtensions = ({
	extensionsFilters,
	dialect,
}: Pick<Config, 'extensionsFilters' | 'dialect'>): string[] => {
	const filters: string[] = [];

	if (extensionsFilters && dialect === 'postgresql') {
		if (extensionsFilters.includes('postgis')) {
			filters.push('!geography_columns', '!geometry_columns', '!spatial_ref_sys');
		}
		if (extensionsFilters.includes('pg_stat_statements')) {
			filters.push('!pg_stat_*');
		}
	}

	return filters;
};
