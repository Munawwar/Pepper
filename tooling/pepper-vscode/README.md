# pepper VS Code tooling

Project status: work in progress.

This in-repo extension package bundles:

- tagged-template syntax highlighting for `html`, `svg`, and `mathml`
- Pepper component-tag syntax highlighting like `<${Component}>...</${Component}>`
- the `pepper-typescript-plugin` server plugin for diagnostics and completions
- structural template diagnostics from `pepper-template-analyzer`

The TextMate grammar files in `syntaxes/` are adapted from
`mjbvz/vscode-lit-html`, which is MIT licensed.

Local testing from the repo root:

- `npm run vscode:prepare`
- `npm run vscode:package`
- `npm run vscode:install`
- `npm run vscode:dev`

The packaged VSIX is kept in the repo at:

- `tooling/pepper-vscode/pepper-vscode.vsix`

The existing fixture workspace at `tooling/test-fixtures/fixture-project` is the target
for manual diagnostics and completion checks.
