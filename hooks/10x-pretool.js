#!/usr/bin/env node
// 10x lens — PreToolUse hook. Fires before every Edit/Write/Bash/PowerShell.
// This is the layer that catches debugging loops and over-building.
// Prose rules in CLAUDE.md drift. This doesn't.

const MUTATING = new Set(['Edit', 'Write', 'Bash', 'PowerShell', 'NotebookEdit']);

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input.replace(/^﻿/, ''));
    const tool = data.tool_name || data.toolName || '';
    if (MUTATING.has(tool)) {
      process.stdout.write(
        `PONYTAIL before ${tool}: ` +
        `(1) Does this change need to exist? ` +
        `(2) Is this attempt #2+ on the same error? If yes — STOP, different approach. ` +
        `(3) Minimum diff only.`
      );
    }
  } catch (e) {
    // silent — never block a tool call
  }
  process.exit(0);
});

// Never hang. Windows sometimes swallows stdin EOF.
setTimeout(() => process.exit(0), 800).unref();
