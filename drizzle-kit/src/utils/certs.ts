import envPaths from 'env-paths';
import { mkdirSync } from 'fs';
import { access, readFile } from 'fs/promises';
import { exec, ExecOptions } from 'node:child_process';
import { join } from 'path';

const p = envPaths('drizzle-studio', {
	suffix: '',
});

mkdirSync(p.data, { recursive: true });

export function runCommand(command: string, options: ExecOptions = {}) {
	return new Promise<{ exitCode: number }>((resolve, reject) => {
		exec(command, options, (error, stdout, stderr) => {
			return resolve({ exitCode: error?.code ?? 0 });
		});
	});
}

export const certs = async () => {
	const res = await runCommand(`mkcert --help`, { cwd: p.data });

	// ~/.local/share/drizzle-studio
	const keyPath = join(p.data, 'localhost-key.pem');
	const certPath = join(p.data, 'localhost.pem');

	if (res.exitCode === 0) {
		try {
			await Promise.all([access(keyPath), access(certPath)]);
		} catch (e) {
			await runCommand(`mkcert localhost`, { cwd: p.data });
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
