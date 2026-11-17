#!/usr/bin/env node
// A source file, not build output: npm links a bin only when its target exists at install time,
// and workspace installs run before this package is built.
import "../dist/cli.mjs";
