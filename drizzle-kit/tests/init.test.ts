import { describe, expect, it } from 'vitest';
import { initHandler } from '../src/cli/commands/init';

describe('drizzle-kit init command', () => {
	it('should exist and be callable', () => {
		expect(typeof initHandler).toBe('function');
	});
});