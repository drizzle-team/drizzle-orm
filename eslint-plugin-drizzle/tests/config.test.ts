import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import plugin from '../src';

const ruleFiles = fs
	.readdirSync(path.resolve(import.meta.dirname, '../src/rules/'))
	.map((f) => path.basename(f, '.ts'));

describe('all rule files should be exported by the plugin', () => {
	for (const ruleName of ruleFiles) {
		it(`should export ${ruleName}`, async () => {
			const rule = await import(path.join('../src/rules', ruleName));
			expect(plugin.rules[ruleName]).toBe(rule.default);
		});
	}
});

describe('configurations', () => {
	it("should export an 'all' configuration", () => {
		expect(plugin.configs.all).toBeDefined();
		for (const configName of Object.keys(plugin.configs.all.rules!)) {
			expect(configName.indexOf('drizzle/')).toBe(0);
			expect(plugin.configs.all.rules![configName]).toBe('error');
		}
		for (const ruleName of ruleFiles) {
			expect(plugin.configs.all.rules!['drizzle/' + ruleName]).toBeDefined();
		}
	});

	it("should export a flat 'all' configuration", () => {
		expect(plugin.configs.flat!.all).toBeDefined();
		for (const configName of Object.keys(plugin.configs.flat!.all.rules!)) {
			expect(configName.indexOf('drizzle/')).toBe(0);
			expect(plugin.configs.flat!.all.rules![configName]).toBe('error');
		}
		for (const ruleName of ruleFiles) {
			expect(
				plugin.configs.flat!.all.rules!['drizzle/' + ruleName],
			).toBeDefined();
		}
	});
});
