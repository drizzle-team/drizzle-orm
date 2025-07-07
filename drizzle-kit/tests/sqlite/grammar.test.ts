import { parseViewSQL } from 'src/dialects/sqlite/grammar';
import { test } from 'vitest';

test('view definition', () => {
	parseViewSQL('CREATE VIEW current_cycle AS\nSELECT\n* from users;');
});
