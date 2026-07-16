import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Returns true when npm installed devDependencies (e.g. plain `npm install`).
 * Skips production-only installs (`--omit=dev`, `--production`).
 *
 * @returns {boolean}
 */
function isDevDependencyInstall() {
  if (process.env.npm_config_production === 'true') {
    return false;
  }

  const omit = process.env.npm_config_omit ?? '';
  if (omit.split(',').map((value) => value.trim()).includes('dev')) {
    return false;
  }

  try {
    require.resolve('@playwright/test/package.json');
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true when Playwright browser download should be skipped (CI/Docker).
 *
 * @returns {boolean}
 */
function shouldSkipPlaywrightInstall() {
  return process.env.CI === 'true' || process.env.CODESAGE_SKIP_PLAYWRIGHT === 'true';
}

if (!shouldSkipPlaywrightInstall() && isDevDependencyInstall()) {
  execSync('npx playwright install', { stdio: 'inherit' });
}
