import { parseViewSQL } from 'src/dialects/sqlite/grammar';
import { test } from 'vitest';

test.only('view definition', () => {
	console.log(parseViewSQL('CREATE VIEW current_cycle AS\nSELECT\n* from users;'));
});
