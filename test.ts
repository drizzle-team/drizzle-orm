import { drizzler } from 'drizzler';
import fs from 'fs';
import { z } from 'zod';

// const configExtractor =

drizzler
	.command('version', () => {
		console.log('v1.0.0');
	})
	.options(
		z.object({
			config: z.string().optional(),
		}),
		({ config: configPath }, ctx) => {
			const config = fs.readFileSync(configPath ?? 'drizzle.config.js');
			ctx.config = config;
		},
	)
	.command('generate', (ctx) => {
		ctx.dialect;
		ctx.out;
	});
