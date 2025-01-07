import envPaths from 'env-paths';
import { mkdirSync } from 'fs';
import { access, readFile } from 'fs/promises';
import { join } from 'path';
import { $ } from 'zx';

export const certs = async () => {
	$.verbose = false;

	const res = await $`mkcert --help`.nothrow();

	if (res.exitCode === 0) {
		const p = envPaths('drizzle-studio', {
			suffix: '',
		});

		$.cwd = p.data;

		// create ~/.local/share/drizzle-studio
		mkdirSync(p.data, { recursive: true });

		const keyPath = join(p.data, 'localhost-key.pem');
		const certPath = join(p.data, 'localhost.pem');

		try {
			// check if the files exist
			await Promise.all([access(keyPath), access(certPath)]);
		} catch (e) {
			// if not create them
			await $`mkcert localhost`.nothrow();
		}
		const [key, cert] = await Promise.all([
			readFile(keyPath, { encoding: 'utf-8' }),
			readFile(certPath, { encoding: 'utf-8' }),
		]);
		return key && cert ? { key, cert } : null;
	}
	return null;
};
