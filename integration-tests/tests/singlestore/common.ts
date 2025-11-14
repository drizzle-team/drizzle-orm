import { tests as tests1 } from './common-1';
import { tests as tests2 } from './common-2';
import { tests as tests3 } from './common-rqb';
import type { Test } from './instrumentation';

export const tests = (test: Test, exclude: string[] = []) => {
	test.beforeEach(({ task, skip }) => {
		if (exclude.includes(task.name)) skip();
	});

	tests1(test);
	tests2(test);
	tests3(test);
};
