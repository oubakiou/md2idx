#!/usr/bin/env node
import { runCli } from "./md2idx.mjs";
//#region src/cli.ts
runCli(process.argv.slice(2));
//#endregion
export {};
