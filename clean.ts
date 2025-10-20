// import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs';
// import { join } from 'node:path';

// const printTree = (path: string, indentation: number) => {
// 	for (const it of readdirSync(path)) {
// 		if (it === 'node_modules') continue;
// 		if (it === '.git') continue;
// 		if (it === '.github') continue;
// 		if (it === '.turbo') continue;
// 		if (it === 'dist') continue;

// 		const full = join(path, it);
// 		const stat = existsSync(full) ? lstatSync(full) : undefined;
// 		if (!stat) continue;

// 		if (stat.isDirectory()) {
// 			printTree(full, indentation + 1);
// 		} else {
// 			if (
// 				full.endsWith('.js')
// 				&& existsSync(full.replace('.js', '.js.map'))
// 				&& existsSync(full.replace('.js', '.ts'))
// 			) {
// 				console.log(full);
// 				rmSync(full);
// 				rmSync(full.replace('.js', '.js.map'));
// 			}
// 		}
// 	}
// };

// I've accidentally ran tsc which generated .d.ts files for all ts files in repo
// printTree(".");
