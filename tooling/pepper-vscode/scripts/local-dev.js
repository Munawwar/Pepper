#!/usr/bin/env node
// @ts-nocheck

const fs = require('node:fs')
const path = require('node:path')
const {spawnSync} = require('node:child_process')

const mode = process.argv[2]
const extensionDir = path.resolve(__dirname, '..')
const rootDir = path.resolve(extensionDir, '..', '..')
const vsixPath = path.join(extensionDir, 'pepper-vscode.vsix')
const fixtureDir = path.join(rootDir, 'tooling', 'test-fixtures', 'fixture-project')
const nodeModulesDir = path.join(extensionDir, 'node_modules')
const candidates =
	process.platform === 'win32' ? ['code.cmd', 'code-insiders.cmd', 'codium.cmd'] : ['code', 'code-insiders', 'codium']

if (!mode || !['prepare', 'package', 'install', 'dev'].includes(mode)) {
	console.error('Usage: node tooling/pepper-vscode/scripts/local-dev.js <prepare|package|install|dev>')
	process.exit(1)
}

const run = (command, args, options = {}) => {
	const result = spawnSync(command, args, {
		cwd: options.cwd || rootDir,
		stdio: 'inherit',
		shell: false,
	})
	if (result.status !== 0) process.exit(result.status || 1)
}

if (mode === 'prepare' || mode === 'package' || mode === 'install') {
	fs.rmSync(nodeModulesDir, {recursive: true, force: true})
	fs.mkdirSync(nodeModulesDir, {recursive: true})
	for (const packageName of ['pepper-typescript-plugin', 'pepper-template-analyzer']) {
		fs.cpSync(path.join(rootDir, 'tooling', packageName), path.join(nodeModulesDir, packageName), {
			recursive: true,
			filter: sourcePath => !sourcePath.includes(`${path.sep}node_modules${path.sep}`),
		})
	}
}

if (mode === 'package' || mode === 'install') {
	if (fs.existsSync(vsixPath)) fs.rmSync(vsixPath)
	run(
		process.platform === 'win32' ? 'npx.cmd' : 'npx',
		['@vscode/vsce', 'package', '--allow-missing-repository', '--out', vsixPath],
		{cwd: extensionDir},
	)
}

if (mode === 'install' || mode === 'dev') {
	const code = candidates.find(candidate => {
		const probe = spawnSync(candidate, ['--version'], {stdio: 'ignore', shell: false})
		return probe.status === 0
	})
	if (!code) {
		console.error('Could not find a VS Code CLI binary. Expected one of: ' + candidates.join(', '))
		process.exit(1)
	}
	if (mode === 'install') run(code, ['--install-extension', vsixPath, '--force'])
	else run(code, ['--new-window', '--extensionDevelopmentPath=' + extensionDir, fixtureDir])
}
