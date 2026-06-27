// Imported before `dotenv/config` so it runs first. Under `mcp`, stdout must carry only
// JSON-RPC frames, but dotenv logs the "injecting env" / debug lines to stdout when
// DOTENV_CONFIG_QUIET is false or DOTENV_CONFIG_DEBUG is set in the environment. Force both
// off for the server process while leaving every other DOTENV_CONFIG_* option intact.
if (process.argv.includes('mcp')) {
	process.env.DOTENV_CONFIG_QUIET = 'true';
	delete process.env.DOTENV_CONFIG_DEBUG;
}
