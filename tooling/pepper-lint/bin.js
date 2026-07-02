#!/usr/bin/env node
// @ts-nocheck

const {run} = require('./index.js')

process.exitCode = run(process.argv.slice(2))
