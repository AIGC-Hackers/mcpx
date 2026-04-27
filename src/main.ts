#!/usr/bin/env bun
import { runMcpx } from "./router";

await runMcpx(process.argv.slice(2), process.cwd());
