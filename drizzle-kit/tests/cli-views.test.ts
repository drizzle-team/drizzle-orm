import { expect, test, vi } from 'vitest';

vi.mock('../src/utils', () => ({
	objectValues: (obj: object) => Object.values(obj),
}));

import { IntrospectProgress, MigrateProgress, ProgressView } from '../src/cli/views';

test('IntrospectProgress prints the underlying error when the task is rejected', () => {
	const view = new IntrospectProgress();
	// hanji's TaskTerminal.reject calls view.render('rejected', err)
	const out = view.render('rejected', new Error('connect ECONNREFUSED 127.0.0.1:5432'));
	expect(out).toContain('connect ECONNREFUSED 127.0.0.1:5432');
});

test('IntrospectProgress does not print an error on pending/done', () => {
	const view = new IntrospectProgress();
	expect(view.render('pending')).not.toContain('ECONNREFUSED');
	expect(view.render('done')).not.toContain('Error during introspection');
});

test('ProgressView prints the underlying error when the task is rejected', () => {
	const view = new ProgressView('Pulling schema...', 'done');
	const out = view.render('rejected', new Error('connect ECONNREFUSED 127.0.0.1:5432'));
	expect(out).toContain('connect ECONNREFUSED 127.0.0.1:5432');
	expect(view.render('done')).not.toContain('ECONNREFUSED');
});

test('MigrateProgress prints the underlying error when the task is rejected', () => {
	const view = new MigrateProgress();
	const out = view.render('rejected', new Error('relation "users" already exists'));
	expect(out).toContain('relation "users" already exists');
	expect(view.render('pending')).not.toContain('already exists');
	expect(view.render('done')).not.toContain('already exists');
});

test('rejected views include the error cause when one is present', () => {
	const err = new Error('could not connect', {
		cause: new Error('connect ECONNREFUSED 127.0.0.1:5432'),
	});
	expect(new ProgressView('Pulling schema...', 'done').render('rejected', err)).toContain(
		'connect ECONNREFUSED 127.0.0.1:5432',
	);
	expect(new MigrateProgress().render('rejected', err)).toContain(
		'connect ECONNREFUSED 127.0.0.1:5432',
	);
	expect(new IntrospectProgress().render('rejected', err)).toContain(
		'connect ECONNREFUSED 127.0.0.1:5432',
	);
});
