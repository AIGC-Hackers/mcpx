#!/usr/bin/env node
import fsPromises from "node:fs/promises";

import { handleCall as runHandleCall } from "@/cli/call-command.js";
import { inferCommandRouting } from "@/cli/command-inference.js";
import { CliUsageError } from "@/cli/errors.js";
import { reportErrorAndExit } from "@/cli/error-reporter.js";
import { extractFlags } from "@/cli/flag-utils.js";
import { handleList } from "@/cli/list-command.js";
import {
  getActiveLogger,
  getActiveLogLevel,
  logError,
  logInfo,
  setLogLevel,
} from "@/cli/logger-context.js";
import { DEBUG_HANG, dumpActiveHandles, terminateChildProcesses } from "@/cli/runtime-debug.js";
import { boldText, dimText, extraDimText, supportsAnsiColor } from "@/cli/terminal.js";
import { parseLogLevel } from "@/logging.js";
import { createRuntime, MCPX_VERSION } from "@/runtime.js";

export { parseCallArguments } from "@/cli/call-arguments.js";
export { handleCall } from "@/cli/call-command.js";
export { extractListFlags, handleList } from "@/cli/list-command.js";
export { resolveCallTimeout } from "@/cli/timeouts.js";

export async function runCli(argv: string[]): Promise<void> {
  const args = [...argv];
  if (args.length === 0) {
    printHelp();
    process.exit(1);
    return;
  }

  const globalFlags = extractFlags(args, ["--config", "--root", "--log-level", "--oauth-timeout"]);
  if (globalFlags["--log-level"]) {
    try {
      const parsedLevel = parseLogLevel(globalFlags["--log-level"], getActiveLogLevel());
      setLogLevel(parsedLevel);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(message, error instanceof Error ? error : undefined);
      process.exit(1);
      return;
    }
  }
  let oauthTimeoutOverride: number | undefined;
  if (globalFlags["--oauth-timeout"]) {
    // Shorten/extend the OAuth browser-wait so tests (or impatient humans) are not stuck for a full minute.
    const parsed = Number.parseInt(globalFlags["--oauth-timeout"], 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      logError("Flag '--oauth-timeout' must be a positive integer (milliseconds).");
      process.exit(1);
      return;
    }
    oauthTimeoutOverride = parsed;
  }
  const command = args.shift();

  if (!command) {
    printHelp();
    process.exit(1);
    return;
  }

  if (isHelpToken(command)) {
    printHelp();
    process.exitCode = 0;
    return;
  }

  if (isVersionToken(command)) {
    await printVersion();
    return;
  }

  const runtimeOptions = {
    configPath: globalFlags["--config"],
    rootDir: globalFlags["--root"],
    logger: getActiveLogger(),
    oauthTimeoutMs: oauthTimeoutOverride,
  };

  const runtime = await createRuntime(runtimeOptions);

  const inference = inferCommandRouting(command, args);
  if (inference.kind === "abort") {
    process.exitCode = inference.exitCode;
    return;
  }
  const resolvedCommand = inference.command;
  const resolvedArgs = inference.args;

  try {
    if (resolvedCommand === "list") {
      await handleList(runtime, resolvedArgs);
      return;
    }

    if (resolvedCommand === "call") {
      await runHandleCall(runtime, resolvedArgs);
      return;
    }
  } finally {
    const closeStart = Date.now();
    if (DEBUG_HANG) {
      logInfo("[debug] beginning runtime.close()");
      dumpActiveHandles("before runtime.close");
    }
    try {
      await runtime.close();
      if (DEBUG_HANG) {
        const duration = Date.now() - closeStart;
        logInfo(`[debug] runtime.close() completed in ${duration}ms`);
        dumpActiveHandles("after runtime.close");
      }
    } catch (error) {
      if (DEBUG_HANG) {
        logError("[debug] runtime.close() failed", error);
      }
    } finally {
      terminateChildProcesses("runtime.finally");
      // By default we force an exit after cleanup so Node doesn't hang on lingering stdio handles
      // (see typescript-sdk#579/#780/#1049). Opt out by exporting MCPX_NO_FORCE_EXIT=1.
      const disableForceExit = process.env.MCPX_NO_FORCE_EXIT === "1";
      if (DEBUG_HANG) {
        dumpActiveHandles("after terminateChildProcesses");
        if (!disableForceExit || process.env.MCPX_FORCE_EXIT === "1") {
          process.exit(0);
        }
      } else {
        const scheduleExit = () => {
          if (!disableForceExit || process.env.MCPX_FORCE_EXIT === "1") {
            process.exit(0);
          }
        };
        setImmediate(scheduleExit);
      }
    }
  }
  printHelp(`Unknown command '${resolvedCommand}'.`);
  process.exit(1);
}

// main parses CLI flags and dispatches to list/call commands.
async function main(): Promise<void> {
  await runCli(process.argv.slice(2));
}

// printHelp explains available commands and global flags.
function printHelp(message?: string): void {
  if (message) {
    console.error(message);
    console.error("");
  }
  const colorize = supportsAnsiColor;
  const sections = buildCommandSections(colorize);
  const globalFlags = formatGlobalFlags(colorize);
  const quickStart = formatQuickStart(colorize);
  const footer = formatHelpFooter(colorize);
  const title = colorize
    ? `${boldText("mcpx")} ${dimText("— Model Context Protocol CLI")}`
    : "mcpx — Model Context Protocol CLI";
  const lines = [
    title,
    "",
    "Usage: mcpx <command> [options]",
    "",
    ...sections,
    "",
    globalFlags,
    "",
    quickStart,
    "",
    footer,
  ];
  console.error(lines.join("\n"));
}

type HelpEntry = {
  name: string;
  summary: string;
  usage: string;
};

type HelpSection = {
  title: string;
  entries: HelpEntry[];
};

function buildCommandSections(colorize: boolean): string[] {
  const sections: HelpSection[] = [
    {
      title: "Commands",
      entries: [
        {
          name: "list",
          summary: "List configured servers and their tools",
          usage: "mcpx list [name] [--output json]",
        },
        {
          name: "call",
          summary: "Call a tool by selector (server.tool) or HTTP URL",
          usage: "mcpx call <selector> [args...]",
        },
      ],
    },
  ];
  return sections.flatMap((section) => formatCommandSection(section, colorize));
}

function formatCommandSection(section: HelpSection, colorize: boolean): string[] {
  const maxNameLength = Math.max(...section.entries.map((entry) => entry.name.length));
  const header = colorize ? boldText(section.title) : section.title;
  const lines = [header];
  section.entries.forEach((entry) => {
    const paddedName = entry.name.padEnd(maxNameLength);
    const renderedName = colorize ? boldText(paddedName) : paddedName;
    const summary = colorize ? dimText(entry.summary) : entry.summary;
    lines.push(`  ${renderedName}  ${summary}`);
    lines.push(`    ${extraDimText("usage:")} ${entry.usage}`);
  });
  return [...lines, ""];
}

function formatGlobalFlags(colorize: boolean): string {
  const title = colorize ? boldText("Global flags") : "Global flags";
  const entries = [
    {
      flag: "--config <path>",
      summary: "Path to mcpx.json (defaults to ./mcp.json + ~/.mcpx/mcp.json)",
    },
    {
      flag: "--root <path>",
      summary: "Working directory for stdio servers",
    },
    {
      flag: "--log-level <debug|info|warn|error>",
      summary: "Adjust CLI logging (defaults to warn)",
    },
    {
      flag: "--oauth-timeout <ms>",
      summary: "Time to wait for browser-based OAuth before giving up (default 60000)",
    },
  ];
  const formatted = entries.map((entry) => `  ${entry.flag.padEnd(34)}${entry.summary}`);
  return [title, ...formatted].join("\n");
}

function formatQuickStart(colorize: boolean): string {
  const title = colorize ? boldText("Quick start") : "Quick start";
  const entries = [
    ["mcpx list", "show configured servers"],
    ["mcpx list linear", "view Linear tool docs"],
    ["mcpx call linear.list_issues({ limit: 5 })", "invoke a tool with arguments"],
  ];
  const formatted = entries.map(([cmd, note]) => {
    const comment = colorize ? dimText(`# ${note}`) : `# ${note}`;
    return `  ${cmd}\n    ${comment}`;
  });
  return [title, ...formatted].join("\n");
}

function formatHelpFooter(colorize: boolean): string {
  const pointer = "Run `mcpx <command> --help` for detailed flags.";
  const autoLoad =
    "Defaults: merge ./mcp.json with ~/.mcpx/mcp.json; first run migrates Cursor/Claude/Codex configs automatically.";
  if (!colorize) {
    return `${pointer}\n${autoLoad}`;
  }
  return `${dimText(pointer)}\n${extraDimText(autoLoad)}`;
}

async function printVersion(): Promise<void> {
  console.log(await resolveCliVersion());
}

function isHelpToken(token: string): boolean {
  return token === "--help" || token === "-h" || token === "help";
}

function isVersionToken(token: string): boolean {
  return token === "--version" || token === "-v" || token === "-V";
}

async function resolveCliVersion(): Promise<string> {
  try {
    const packageJsonPath = new URL("../package.json", import.meta.url);
    const buffer = await fsPromises.readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(buffer) as { version?: string };
    return pkg.version ?? MCPX_VERSION;
  } catch {
    // Expected: package.json may not be accessible in bundled builds; fall back to embedded version
    return MCPX_VERSION;
  }
}

if (process.env.MCPX_DISABLE_AUTORUN !== "1") {
  main().catch((error) => {
    if (error instanceof CliUsageError) {
      logError(error.message);
      process.exit(1);
      return;
    }
    // Use unified error reporter for LLM-friendly output
    reportErrorAndExit(error);
  });
}
