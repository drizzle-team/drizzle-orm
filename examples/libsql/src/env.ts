import { parseEnv } from 'znv';
import { z } from 'zod';

export const { DATABASE_URL } = parseEnv(process.env, {
	DATABASE_URL: z.string().min(1),
});
