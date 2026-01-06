#!/usr/bin/env bun
import { Glob } from 'bun';
import fs from 'node:fs/promises';
import path from 'node:path';

function resolvePathAlias(importPath: string, file: string) {
	if (importPath.startsWith('~/')) {
		const relativePath = path.relative(path.dirname(file), path.resolve('dist.new', importPath.slice(2)));
		return relativePath.startsWith('.') ? relativePath : './' + relativePath;
	}
	return importPath;
}

function fixImportPath(importPath: string, file: string, ext: string) {
	importPath = resolvePathAlias(importPath, file);

	if (!/\..*\.(js|ts)$/.test(importPath)) {
		return importPath;
	}

	return importPath.replace(/\.(js|ts)$/, ext);
}

async function processFile(file: string, ext: string) {
	let code = await fs.readFile(file, 'utf8');

	// Handle: import ... from "path" / export ... from "path" / export * from "path"
	code = code.replace(
		/(from\s+["'])([^"']+)(["'])/g,
		(_, prefix, importPath, suffix) => prefix + fixImportPath(importPath, file, ext) + suffix,
	);

	// Handle: require("path")
	code = code.replace(
		/(require\s*\(\s*["'])([^"']+)(["']\s*\))/g,
		(_, prefix, importPath, suffix) => prefix + fixImportPath(importPath, file, ext) + suffix,
	);

	// Handle: import("path") - dynamic imports
	code = code.replace(
		/(import\s*\(\s*["'])([^"']+)(["']\s*\))/g,
		(_, prefix, importPath, suffix) => prefix + fixImportPath(importPath, file, ext) + suffix,
	);

	await fs.writeFile(file, code);
}

// Process CJS files
const cjsGlob = new Glob('dist.new/**/*.{cjs,d.cts}');
const cjsFiles: string[] = [];
for await (const file of cjsGlob.scan('.')) {
	cjsFiles.push(file);
}
await Promise.all(cjsFiles.map((file) => processFile(file, '.cjs')));

// Process ESM files
const esmGlob = new Glob('dist.new/**/*.{js,d.ts}');
const esmFiles: string[] = [];
for await (const file of esmGlob.scan('.')) {
	esmFiles.push(file);
}
await Promise.all(esmFiles.map((file) => processFile(file, '.js')));
