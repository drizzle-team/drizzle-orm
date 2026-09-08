import { bench } from './bench.ts';
import { capitalize } from './utils.ts';

const folder = process.argv[2] ?? 'rqb';
const tsVer = (['latest', 'next'].includes(process.argv[3] ?? '') ? process.argv[3] : 'latest') as 'latest' | 'next';

const beta: Record<string, string> = {};
const current: Record<string, string> = {};

for (const { data, name } of bench(folder, 'beta', tsVer)) {
	beta[name.split('-').map((e) => capitalize(e)).join(' ')] = `${data.instantiations}`;
}

for (const { data, name } of bench(folder, 'current', tsVer)) {
	current[name.split('-').map((e) => capitalize(e)).join(' ')] = `${data.instantiations}`;
}

const compiled = {
	beta,
	current,
};

console.log(`typescript@${tsVer}`);
console.table(compiled);
