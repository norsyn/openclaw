#!/usr/bin/env node
import { runOllamaRuntimeDiagnosticFromCli } from "../src/diagnostics/ollama-runtime-diagnostic.js";

void runOllamaRuntimeDiagnosticFromCli(process.argv.slice(2));
