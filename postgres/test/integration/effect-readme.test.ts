// Runs every TypeScript example in src/effect/README.md against the local cluster.
import { expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const readme = await Bun.file(`${root}src/effect/README.md`).text();
const examples = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]!);

const tmp = `${root}test/.readme-examples`;

test('the Effect README has examples', () => {
	expect(examples.length).toBeGreaterThanOrEqual(4);
});

for (const [i, code] of examples.entries()) {
	test(`Effect README example ${i + 1} runs`, async () => {
		mkdirSync(tmp, { recursive: true });
		const file = `${tmp}/example-${i}.ts`;
		writeFileSync(
			file,
			code
				.replaceAll("'@drizzle-team/postgres/effect/core'", `'${root}src/effect/core.ts'`)
				.replaceAll("'@drizzle-team/postgres/effect'", `'${root}src/effect/index.ts'`)
				.replaceAll("'@drizzle-team/postgres'", `'${root}src/index.ts'`),
		);
		try {
			const proc = Bun.spawn(['bun', file], { stdout: 'pipe', stderr: 'pipe' });
			const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
			expect(stderr).toBe('');
			expect(code).toBe(0);
		} finally {
			rmSync(file, { force: true });
		}
	}, 15000);
}
