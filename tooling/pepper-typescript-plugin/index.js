// @ts-nocheck

const {analyzeSourceFile, getCompletionsAtPosition} = require('../pepper-template-analyzer/index.js')

function init(modules) {
	const ts = modules.typescript

	return {
		create(info) {
			const proxy = {}
			const languageService = info.languageService
			for (const key of Object.keys(languageService)) proxy[key] = languageService[key].bind(languageService)

			proxy.getSemanticDiagnostics = fileName => {
				const baseDiagnostics = languageService.getSemanticDiagnostics(fileName)
				const program = languageService.getProgram()
				const sourceFile = program?.getSourceFile(fileName)
				if (!program || !sourceFile || sourceFile.isDeclarationFile) return baseDiagnostics
				const occupiedRanges = baseDiagnostics
					.filter(diagnostic => typeof diagnostic.start === 'number' && typeof diagnostic.length === 'number')
					.map(diagnostic => [diagnostic.start, diagnostic.start + diagnostic.length])
				const analyzerDiagnostics = analyzeSourceFile(ts, program, sourceFile).filter(diagnostic => {
					const start = diagnostic.start ?? -1
					const end = start + (diagnostic.length ?? 0)
					return !occupiedRanges.some(([occupiedStart, occupiedEnd]) => start >= occupiedStart && end <= occupiedEnd)
				})
				return baseDiagnostics.concat(analyzerDiagnostics)
			}

			proxy.getCompletionsAtPosition = (fileName, position, options, formattingSettings) => {
				const program = languageService.getProgram()
				const sourceFile = program?.getSourceFile(fileName)
				if (!program || !sourceFile || sourceFile.isDeclarationFile)
					return languageService.getCompletionsAtPosition(fileName, position, options, formattingSettings)
				const analyzerCompletions = getCompletionsAtPosition(ts, program, sourceFile, position)
				if (!analyzerCompletions?.entries.length)
					return languageService.getCompletionsAtPosition(fileName, position, options, formattingSettings)
				const baseCompletions = languageService.getCompletionsAtPosition(
					fileName,
					position,
					options,
					formattingSettings,
				)
				if (!baseCompletions) {
					return {
						isGlobalCompletion: false,
						isMemberCompletion: false,
						isNewIdentifierLocation: false,
						entries: analyzerCompletions.entries.map(entry => ({
							name: entry.name,
							kind: entry.kind,
							kindModifiers: '',
							sortText: entry.sortText,
							insertText: entry.insertText || entry.name,
							replacementSpan: analyzerCompletions.replacementSpan,
						})),
					}
				}
				const existingNames = new Set(baseCompletions.entries.map(entry => entry.name))
				for (const entry of analyzerCompletions.entries) {
					if (existingNames.has(entry.name)) continue
					baseCompletions.entries.push({
						name: entry.name,
						kind: entry.kind,
						kindModifiers: '',
						sortText: entry.sortText,
						insertText: entry.insertText || entry.name,
						replacementSpan: analyzerCompletions.replacementSpan,
					})
				}
				return baseCompletions
			}

			return proxy
		},
	}
}

module.exports = init
