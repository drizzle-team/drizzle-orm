import type { Config } from '../index';

export const getTablesFilterByExtensions = ({
	extensionsFilters,
	dialect,
}: Pick<Config, 'extensionsFilters' | 'dialect'>): string[] => {
	const tableFilters: string[] = [];
	if (extensionsFilters) {
		if (
			extensionsFilters.includes('postgis')
			&& dialect === 'postgresql'
		) {
			tableFilters.push('!geography_columns', '!geometry_columns', '!spatial_ref_sys');
		}

		if (
			extensionsFilters.includes('pg_stat_statements')
			&& dialect === 'postgresql'
		) {
			tableFilters.push('!pg_stat_statements', '!pg_stat_statements_info');
		}
	}
	return tableFilters;
};
