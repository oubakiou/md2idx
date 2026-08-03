#!/usr/bin/env node

import { closeSync, openSync } from "node:fs";
import { spawn } from "node:child_process";

const [timeoutSecondsText, version, inputFile, outputFile] = process.argv.slice(2);
const timeoutSeconds = Number.parseInt(timeoutSecondsText, 10);

if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 2147483) {
  console.error("ERROR: timeout must be between 1 and 2147483 seconds");
  process.exit(64);
}

const outputFd = openSync(outputFile, "w", 0o600);
const child = spawn("npx", ["-y", `md2idx@${version}`, inputFile], {
  detached: true,
  stdio: ["ignore", outputFd, "inherit"],
});

let timedOut = false;
let killTimer;
const timer = setTimeout(() => {
  timedOut = true;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  killTimer = setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    process.exit(124);
  }, 2000);
}, timeoutSeconds * 1000);

child.on("error", (error) => {
  clearTimeout(timer);
  clearTimeout(killTimer);
  closeSync(outputFd);
  console.error(`ERROR: failed to start npx: ${error.message}`);
  process.exit(127);
});

child.on("exit", (code, signal) => {
  clearTimeout(timer);
  closeSync(outputFd);
  if (timedOut) return;
  clearTimeout(killTimer);
  if (signal) {
    console.error(`ERROR: npx terminated by ${signal}`);
    process.exit(128);
  }
  process.exit(code ?? 1);
});
