import 'dotenv/config';

import * as version from 'drizzle-orm/version';
import { expect, test } from 'vitest';
import { z } from 'zod';

test('shape', () => {
	const shape = z.object({
		compatibilityVersion: z.number(),
		npmVersion: z.string(),
	});
	expect(() => shape.parse(version)).not.toThrowError();
});
