import { beforeEach } from 'vitest';

export function skipTests(names: string[]) {
	beforeEach(({ task, skip }) => {
		if (task.suite?.name === 'common' && names.includes(task.name)) {
			skip();
		}
	});
}
