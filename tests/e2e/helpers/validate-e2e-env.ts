/** Required E2E env keys and human-readable descriptions for error output. */
const REQUIRED_ENV: ReadonlyArray<{ key: string; description: string }> = [
  {
    key: "E2E_PRIVATE_REPO_URL",
    description: "Private Git clone URL for attach tests (your private repo)",
  },
  {
    key: "E2E_GITHUB_TOKEN",
    description: "Read-only token for the private repo",
  },
];

/**
 * Returns env var names that are missing or blank.
 *
 * @param env - Environment map (defaults to `process.env`).
 */
export function missingRequiredE2eEnv(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (env.E2E_SKIP === "1") {
    return [];
  }

  return REQUIRED_ENV.filter(({ key }) => !env[key]?.trim()).map(({ key }) => key);
}

/**
 * Validates required E2E variables. Prints a clear error block and throws when incomplete.
 *
 * @param env - Environment map (defaults to `process.env`).
 */
export function validateE2eEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.E2E_SKIP === "1") {
    console.log("E2E skipped (E2E_SKIP=1)");
    return;
  }

  const missing = missingRequiredE2eEnv(env);
  if (missing.length === 0) {
    return;
  }

  const lines = [
    "",
    "E2E configuration error — missing required variables in tests/e2e/.env:",
    "",
  ];

  for (const { key, description } of REQUIRED_ENV) {
    if (missing.includes(key)) {
      lines.push(`  ${key.padEnd(22)} ${description}`);
    }
  }

  lines.push(
    "",
    "Copy tests/e2e/.env.example → tests/e2e/.env and set both values.",
    "Public repo uses built-in default (octocat/Hello-World); override with E2E_PUBLIC_REPO_URL if needed.",
    "",
    "See tests/e2e/README.md",
    "",
  );

  console.error(lines.join("\n"));
  throw new Error("E2E env incomplete");
}
