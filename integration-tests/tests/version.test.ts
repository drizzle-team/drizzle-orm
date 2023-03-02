import 'dotenv/config';

import test from 'ava';
import * as version from 'drizzle-orm/version';
import { z } from 'zod';

test('shape', (t) => {
	const shape = z.object({
		compatibilityVersion: z.number(),
		npmVersion: z.string(),
	});
	t.notThrows(() => shape.parse(version));
});
