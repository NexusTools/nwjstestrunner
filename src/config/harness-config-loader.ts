import * as fs from 'fs';
import * as path from 'path';
import { NwjsCliOptions, NwjsHarnessConfig } from '../types/test-runner-types';

export class HarnessConfigLoader {
  public static resolveProjectRoot(explicitRoot?: string): string {
    if (explicitRoot) {
      return path.resolve(explicitRoot);
    }
    const envRoot = process.env.NWJS_TEST_PROJECT_ROOT;
    if (envRoot) {
      return path.resolve(envRoot);
    }
    const cwd = process.cwd();
    if (path.basename(cwd).toLowerCase() === 'testrunner' || path.basename(cwd).toLowerCase() === 'runner') {
      const parentPkg = path.resolve(cwd, '..', 'package.json');
      if (fs.existsSync(parentPkg)) {
        return path.resolve(cwd, '..');
      }
    }
    return cwd;
  }

  public static findConfigFile(projectRootDir: string, explicitConfigPath?: string): string | null {
    if (explicitConfigPath) {
      const resolved = path.isAbsolute(explicitConfigPath)
        ? explicitConfigPath
        : path.resolve(projectRootDir, explicitConfigPath);
      return fs.existsSync(resolved) ? resolved : null;
    }

    const envConfig = process.env.NWJS_TEST_CONFIG_PATH;
    if (envConfig && fs.existsSync(envConfig)) {
      return path.resolve(envConfig);
    }

    const candidates = [
      'nwjstestrunner.config.cjs',
      'nwjstestrunner.config.js',
      'nwjstestrunner.config.json'
    ];
    for (const filename of candidates) {
      const candidatePath = path.join(projectRootDir, filename);
      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        return candidatePath;
      }
    }

    return null;
  }

  public static loadConfig(
    projectRootDir?: string,
    explicitConfigPath?: string,
    cliOverrides?: NwjsCliOptions
  ): NwjsHarnessConfig {
    const resolvedRoot = HarnessConfigLoader.resolveProjectRoot(
      cliOverrides?.projectRootDir || projectRootDir
    );
    let loadedConfig: Partial<NwjsHarnessConfig> = {};

    const configFile = HarnessConfigLoader.findConfigFile(
      resolvedRoot,
      cliOverrides?.configPath || explicitConfigPath
    );

    if (configFile) {
      if (configFile.endsWith('.json')) {
        const raw = fs.readFileSync(configFile, 'utf-8');
        loadedConfig = JSON.parse(raw);
      } else {
        // Clear require cache so fresh config is loaded
        try {
          delete require.cache[require.resolve(configFile)];
        } catch (_e) {}
        const mod = require(configFile);
        loadedConfig = mod && mod.default ? mod.default : mod;
      }
    } else {
      const pkgJsonPath = path.join(resolvedRoot, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
          if (pkg && pkg.nwjstestrunner && typeof pkg.nwjstestrunner === 'object') {
            loadedConfig = pkg.nwjstestrunner;
          }
        } catch (_e) {}
      }
    }

    const envOverrides: Partial<NwjsHarnessConfig> = {};
    if (process.env.NWJS_TEST_CLI_OVERRIDES) {
      try {
        Object.assign(envOverrides, JSON.parse(process.env.NWJS_TEST_CLI_OVERRIDES));
      } catch (_e) {}
    }

    const merged: NwjsHarnessConfig = {
      projectRootDir: resolvedRoot,
      ...loadedConfig,
      ...envOverrides
    };

    if (cliOverrides) {
      if (cliOverrides.projectRootDir) merged.projectRootDir = path.resolve(cliOverrides.projectRootDir);
      if (cliOverrides.testFiles && cliOverrides.testFiles.length > 0) {
        merged.testFiles = cliOverrides.testFiles;
      }
      if (cliOverrides.testFilter !== undefined) merged.testFilter = cliOverrides.testFilter;
      if (cliOverrides.logPath) merged.testLogPath = path.resolve(resolvedRoot, cliOverrides.logPath);
      if (cliOverrides.title) merged.title = cliOverrides.title;
      if (cliOverrides.webviewEntryHtml) merged.webviewEntryHtml = cliOverrides.webviewEntryHtml;
      if (cliOverrides.enableWebview !== undefined) merged.enableWebview = cliOverrides.enableWebview;
      if (cliOverrides.initTimeoutMs !== undefined) merged.initTimeoutMs = cliOverrides.initTimeoutMs;
      if (cliOverrides.globalTimeoutMs !== undefined) merged.globalTimeoutMs = cliOverrides.globalTimeoutMs;
      if (cliOverrides.keepOpen !== undefined) merged.keepOpen = cliOverrides.keepOpen;
    }

    return merged;
  }

  public static resolveTestFiles(projectRootDir: string, patterns?: string[]): string[] {
    const root = path.resolve(projectRootDir);
    if (patterns && patterns.length > 0) {
      const resolved = new Set<string>();
      for (const pattern of patterns) {
        if (!pattern.includes('*')) {
          const direct = path.isAbsolute(pattern) ? pattern : path.resolve(root, pattern);
          if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
            resolved.add(direct);
          }
        } else {
          const matches = HarnessConfigLoader.walkMatchingFiles(root, pattern);
          for (const m of matches) {
            resolved.add(m);
          }
        }
      }
      return Array.from(resolved);
    }

    // Default auto-discovery in dist/ or tests/
    const searchDirs = ['dist', 'tests', 'test'];
    const discovered: string[] = [];
    for (const sub of searchDirs) {
      const dirPath = path.join(root, sub);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        HarnessConfigLoader.collectDefaultTestFiles(dirPath, discovered);
      }
    }
    return discovered;
  }

  private static collectDefaultTestFiles(dir: string, out: string[]): void {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        HarnessConfigLoader.collectDefaultTestFiles(fullPath, out);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.test.js') ||
          entry.name.endsWith('.spec.js') ||
          entry.name.endsWith('Suites.js'))
      ) {
        out.push(fullPath);
      }
    }
  }

  private static walkMatchingFiles(rootDir: string, pattern: string): string[] {
    const normalizedPattern = pattern.replace(/\\/g, '/');
    const regexStr =
      '^' +
      normalizedPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*\//g, '(?:.+/)?')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*') +
      '$';
    const regex = new RegExp(regexStr, 'i');
    const results: string[] = [];

    const walk = (currentDir: string) => {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch (_e) {
        return;
      }
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
          if (regex.test(rel)) {
            results.push(fullPath);
          }
        }
      }
    };

    walk(rootDir);
    return results;
  }
}
