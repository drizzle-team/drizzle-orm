import envPaths from 'env-paths';
import { mkdirSync } from 'fs';
import { access, readFile } from 'fs/promises';
import { join } from 'path';

const p = envPaths('drizzle-studio', {
	suffix: '',
});

mkdirSync(p.data, { recursive: true });

/** Bun shell docs: https://bun.sh/docs/runtime/shell */
async function bunShell() {
	const $ = (await import('bun').catch(() => undefined as never)).$;
	$.cwd(p.data);
	return $;
}

/** ZX shell docs: https://google.github.io/zx */
async function zxShell() {
	const $ = (await import('zx')).$;
	$.cwd = p.data;
	$.verbose = false;
	return $;
}

export const certs = async () => {
	const $ = await (
		typeof Bun !== 'undefined' // https://bun.sh/guides/util/detect-bun
			? bunShell()
			: zxShell()
	);

	const res = await $`mkcert --help`.nothrow();

	// ~/.local/share/drizzle-studio
	const keyPath = join(p.data, 'localhost-key.pem');
	const certPath = join(p.data, 'localhost.pem');

	if (res.exitCode === 0) {
		try {
			await Promise.all([access(keyPath), access(certPath)]);
		} catch (e) {
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

certs();
