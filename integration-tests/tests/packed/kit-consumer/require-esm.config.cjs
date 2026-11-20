// A CommonJS config that requires an ESM package. It fails with `ERR_REQUIRE_ESM` on a Node version
// without `require(esm)`.
require('drizzle-orm/pg-core');

module.exports = { dialect: 'postgresql', schema: './schema.ts', out: './drizzle' };
