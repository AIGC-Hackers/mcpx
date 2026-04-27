export function assertServerName(name: string): string {
  const trimmed = name.trim();
  if (!/^[a-z][a-z0-9_-]*$/i.test(trimmed)) {
    throw new Error(
      'Server name must start with a letter and contain only letters, numbers, "_" or "-".',
    );
  }
  return trimmed;
}

export function toCommandName(toolName: string): string {
  const normalized = toolName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "tool";
}

export function assignCommandNames(toolNames: string[]): Map<string, string> {
  const seen = new Map<string, string>();
  const result = new Map<string, string>();

  for (const toolName of toolNames) {
    const base = toCommandName(toolName);
    const existing = seen.get(base);
    if (!existing) {
      seen.set(base, toolName);
      result.set(toolName, base);
      continue;
    }

    if (existing === toolName) {
      result.set(toolName, base);
      continue;
    }

    throw new Error(
      `Tool names "${existing}" and "${toolName}" both map to CLI command "${base}". Rename or filter one of them before adding this server.`,
    );
  }

  return result;
}
