import envPaths from 'env-paths';
import { mkdirSync } from 'fs';
import { access, readFile } from 'fs/promises';
import type { ExecOptions } from 'node:child_process';
import { exec } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { join } from 'path';

function runCommand(command: string, options: ExecOptions = {}) {
	return new Promise<{ exitCode: number }>((resolve) => {
		exec(command, options, (error) => {
			return resolve({ exitCode: error?.code ?? 0 });
		});
	});
}

function isCertValid(certPem: string): boolean {
	try {
		const cert = new X509Certificate(certPem);
		const now = new Date();
		return now >= new Date(cert.validFrom) && now <= new Date(cert.validTo);
	} catch {
		return false;
	}
}

export const certs = async () => {
	const res = await runCommand('mkcert --help');

	if (res.exitCode === 0) {
		const p = envPaths('drizzle-studio', {
			suffix: '',
		});

		// create the directory if it doesn't exist
		// linux: ~/.local/share/drizzle-studio
		// macos: ~/Library/Application\ Support/drizzle-studio
		// windows: %LOCALAPPDATA%\drizzle-studio\Data
		mkdirSync(p.data, { recursive: true });

		const keyPath = join(p.data, 'localhost-key.pem');
		const certPath = join(p.data, 'localhost.pem');

		let needsCreate = false;
		try {
			// check if the files exist
			await Promise.all([access(keyPath), access(certPath)]);
			// check if the cert is still valid
			const certPem = await readFile(certPath, { encoding: 'utf-8' });
			if (!isCertValid(certPem)) {
				needsCreate = true;
			}
		} catch {
			needsCreate = true;
		}

		if (needsCreate) {
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
