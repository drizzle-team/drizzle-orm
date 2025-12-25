const isBun = typeof globalThis.Bun !== 'undefined';

if (isBun) {
	// Bun has native TypeScript support, just run the CLI directly
	require('./cli/index');
} else {
	// Node.js - register tsx for TypeScript transpilation at runtime
	// Register both CJS and ESM loaders to support all module types
	const tsx = require('tsx/cjs/api');
	tsx.register();

	require('./cli/index');
}
