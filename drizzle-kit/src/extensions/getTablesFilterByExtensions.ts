import type { Config } from '../index';

export const getTablesFilterByExtensions = ({
	extensionsFilters,
	dialect,
}: Pick<Config, 'extensionsFilters' | 'dialect'>): string[] => {
	if (extensionsFilters) {
		if (
			extensionsFilters.includes('postgis')
			&& dialect === 'postgresql'
		) {
			return ['!geography_columns', '!geometry_columns', '!spatial_ref_sys'];
		}
	}
	return [];
};
