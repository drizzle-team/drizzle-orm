import { IntrospectProgress } from 'src/cli/views';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

// the view starts a spinner interval in its constructor
beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

test('does not render primary keys and enums for a dialect that does not report them', () => {
	const output = new IntrospectProgress().render();

	expect(output).not.toContain('primary keys');
	expect(output).not.toContain('enums');
	expect(output).toContain('tables');
});

test('renders primary keys for a dialect that reports them, up to done', () => {
	const progress = new IntrospectProgress({ pks: true });
	expect(progress.render()).toContain('primary keys fetching');

	progress.update('pks', 2, 'done');

	expect(progress.render()).toMatch(/2\s+primary keys fetched/);
});

test('renders enums for a dialect that reports them', () => {
	const output = new IntrospectProgress({ enums: true }).render();

	expect(output).toContain('enums');
	expect(output).not.toContain('primary keys');
});
