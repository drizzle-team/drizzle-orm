import { bench } from './bench.ts';
import { capitalize } from './utils.ts';

const folder = process.argv[2] ?? 'rqb';

const beta: Record<string, string> = {};
const current: Record<string, string> = {};

for (const { data, name } of bench(folder, 'beta')) {
	beta[name.split('-').map((e) => capitalize(e)).join(' ')] = `${data.instantiations}`;
}

for (const { data, name } of bench(folder, 'current')) {
	current[name.split('-').map((e) => capitalize(e)).join(' ')] = `${data.instantiations}`;
}

const compiled = {
	beta,
	current,
};

console.table(compiled);
