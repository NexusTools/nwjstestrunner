import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { HarnessConfigLoader } from '../config/harness-config-loader';
import { NwjsCliOptions } from '../types/test-runner-types';

export class NwjsCliLauncher {
  public static parseCliArgs(argv: string[]): NwjsCliOptions & { help?: boolean } {
    const options: NwjsCliOptions & { help?: boolean } = {
      testFiles: []
    };

    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === '--help' || arg === '-h') {
        options.help = true;
      } else if ((arg === '--project-root' || arg === '-r') && argv[i + 1]) {
        options.projectRootDir = argv[++i];
      } else if (arg.startsWith('--project-root=')) {
        options.projectRootDir = arg.slice('--project-root='.length);
      } else if ((arg === '--config' || arg === '-c') && argv[i + 1]) {
        options.configPath = argv[++i];
      } else if (arg.startsWith('--config=')) {
        options.configPath = arg.slice('--config='.length);
      } else if ((arg === '--filter' || arg === '-t') && argv[i + 1]) {
        options.testFilter = argv[++i];
      } else if (arg.startsWith('--filter=')) {
        options.testFilter = arg.slice('--filter='.length);
      } else if ((arg === '--log-path' || arg === '-o') && argv[i + 1]) {
        options.logPath = argv[++i];
      } else if (arg.startsWith('--log-path=')) {
        options.logPath = arg.slice('--log-path='.length);
      } else if (arg === '--title' && argv[i + 1]) {
        options.title = argv[++i];
      } else if (arg.startsWith('--title=')) {
        options.title = arg.slice('--title='.length);
      } else if (arg === '--webview-entry' && argv[i + 1]) {
        options.webviewEntryHtml = argv[++i];
      } else if (arg.startsWith('--webview-entry=')) {
        options.webviewEntryHtml = arg.slice('--webview-entry='.length);
      } else if (arg === '--enable-webview') {
        options.enableWebview = true;
      } else if (arg === '--no-webview') {
        options.enableWebview = false;
      } else if (arg === '--init-timeout' && argv[i + 1]) {
        options.initTimeoutMs = Number(argv[++i]);
      } else if (arg.startsWith('--init-timeout=')) {
        options.initTimeoutMs = Number(arg.slice('--init-timeout='.length));
      } else if (arg === '--timeout' && argv[i + 1]) {
        options.globalTimeoutMs = Number(argv[++i]);
      } else if (arg.startsWith('--timeout=')) {
        options.globalTimeoutMs = Number(arg.slice('--timeout='.length));
      } else if (arg === '--user-data-dir' && argv[i + 1]) {
        options.userDataDir = argv[++i];
      } else if (arg.startsWith('--user-data-dir=')) {
        options.userDataDir = arg.slice('--user-data-dir='.length);
      } else if (arg === '--nw-path' && argv[i + 1]) {
        options.nwExecutablePath = argv[++i];
      } else if (arg.startsWith('--nw-path=')) {
        options.nwExecutablePath = arg.slice('--nw-path='.length);
      } else if (arg === '--keep-open') {
        options.keepOpen = true;
      } else if (arg === '--test-files' && argv[i + 1]) {
        const parts = argv[++i]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        options.testFiles!.push(...parts);
      } else if (!arg.startsWith('-')) {
        options.testFiles!.push(arg);
      }
    }

    if (options.testFiles && options.testFiles.length === 0) {
      delete options.testFiles;
    }

    return options;
  }

  public static getHelpText(): string {
    return [
      'Usage: nwjstestrunner [options] [testFilePatterns...]',
      '',
      'Options:',
      '  -r, --project-root <dir>     Project root directory (default: process.cwd())',
      '  -c, --config <file>          Path to nwjstestrunner.config.{cjs,js,json}',
      '  -t, --filter <pattern>       Run only tests matching the given substring',
      '  -o, --log-path <file>        Output path for desktop-tests.log',
      '  --title <title>              Window & overlay card title',
      '  --webview-entry <html>       Entry HTML file to load into <webview>',
      '  --enable-webview             Force enable <webview> client loading',
      '  --no-webview                 Disable <webview> and run Jest unit suites only',
      '  --init-timeout <ms>          Watchdog initialization timeout (default: 8000)',
      '  --timeout <ms>               Global harness deadline timeout (default: 35000)',
      '  --user-data-dir <dir>        Custom Chromium user-data-dir for NW.js',
      '  --nw-path <executable>       Explicit path to NW.js executable',
      '  --keep-open                  Keep the graphical NW.js window open after tests finish',
      '  -h, --help                   Display this help message'
    ].join('\n');
  }

  public static resolveNwExecutable(projectRootDir: string, explicitPath?: string): string {
    if (explicitPath && fs.existsSync(explicitPath)) {
      return path.resolve(explicitPath);
    }
    if (process.env.NWJS_EXECUTABLE_PATH && fs.existsSync(process.env.NWJS_EXECUTABLE_PATH)) {
      return path.resolve(process.env.NWJS_EXECUTABLE_PATH);
    }

    const packageRoot = path.resolve(__dirname, '..', '..');
    const searchPaths = [projectRootDir, packageRoot, process.cwd()];
    const isWin = process.platform === 'win32';

    // Prefer direct native NW.js executable (nw.exe / nw) inside node_modules/nw/nwjs* first
    for (const base of searchPaths) {
      let dir = path.resolve(base);
      for (let depth = 0; depth < 4; depth++) {
        const nwPkgDir = path.join(dir, 'node_modules', 'nw');
        if (fs.existsSync(nwPkgDir) && fs.statSync(nwPkgDir).isDirectory()) {
          try {
            const subEntries = fs.readdirSync(nwPkgDir, { withFileTypes: true });
            for (const sub of subEntries) {
              if ((sub.isDirectory() || sub.isSymbolicLink()) && sub.name.startsWith('nwjs')) {
                const candidate = isWin
                  ? path.join(nwPkgDir, sub.name, 'nw.exe')
                  : process.platform === 'darwin'
                    ? path.join(nwPkgDir, sub.name, 'nwjs.app', 'Contents', 'MacOS', 'nwjs')
                    : path.join(nwPkgDir, sub.name, 'nw');
                if (fs.existsSync(candidate)) {
                  return candidate;
                }
              }
            }
          } catch (_e) {}
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }

    for (const base of searchPaths) {
      try {
        const nwModPath = require.resolve('nw', { paths: [base] });
        const nwMod = require(nwModPath);
        if (nwMod && typeof nwMod.findpath === 'function') {
          const binPath = nwMod.findpath();
          if (typeof binPath === 'string' && fs.existsSync(binPath)) {
            return binPath;
          }
        }
      } catch (_e) {}
    }

    for (const base of searchPaths) {
      let dir = path.resolve(base);
      for (let depth = 0; depth < 4; depth++) {
        const dotBin = isWin
          ? path.join(dir, 'node_modules', '.bin', 'nw.cmd')
          : path.join(dir, 'node_modules', '.bin', 'nw');
        if (typeof dotBin === 'string' && fs.existsSync(dotBin)) {
          return dotBin;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }

    return isWin ? 'nw.exe' : 'nw';
  }

  public static async launch(cliOptions: NwjsCliOptions = {}): Promise<number> {
    const projectRootDir = HarnessConfigLoader.resolveProjectRoot(cliOptions.projectRootDir);
    const configFile = HarnessConfigLoader.findConfigFile(projectRootDir, cliOptions.configPath);
    const mergedConfig = HarnessConfigLoader.loadConfig(
      projectRootDir,
      configFile || undefined,
      cliOptions
    );

    const logPath =
      mergedConfig.testLogPath ||
      path.join(projectRootDir, 'testrunner', 'test-results', 'desktop-tests.log');

    const userDataDir = cliOptions.userDataDir
      ? path.resolve(projectRootDir, cliOptions.userDataDir)
      : path.join(projectRootDir, '.nw-userdata-test');

    const packageRoot = path.resolve(__dirname, '..', '..');
    const runnerDir = path.join(packageRoot, 'runner');
    const nwExe = NwjsCliLauncher.resolveNwExecutable(projectRootDir, cliOptions.nwExecutablePath);

    const args = [runnerDir, `--user-data-dir=${userDataDir}`, ...(cliOptions.headlessArgs || [])];

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NWJS_TEST_PROJECT_ROOT: projectRootDir,
      NWJS_TEST_LOG_PATH: logPath,
      NWJS_TEST_PACKAGE_ROOT: packageRoot,
      NWJS_TEST_CLI_OVERRIDES: JSON.stringify(cliOptions)
    };
    if (configFile) {
      env.NWJS_TEST_CONFIG_PATH = configFile;
    }

    const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(nwExe);

    return new Promise<number>((resolve) => {
      const child = spawn(nwExe, args, {
        cwd: projectRootDir,
        env,
        stdio: 'inherit',
        shell: useShell
      });

      child.on('error', (err) => {
        console.error(`[nwjstestrunner] Failed to spawn NW.js (${nwExe}):`, err.message);
        resolve(1);
      });

      child.on('close', (code) => {
        let logContent = '';
        if (fs.existsSync(logPath)) {
          try {
            logContent = fs.readFileSync(logPath, 'utf-8');
            console.log('\n' + logContent + '\n');
          } catch (_e) {}
        }

        const logFailed =
          !logContent ||
          logContent.includes('Status: Tests interupted') ||
          logContent.includes('FAILURES & ERRORS:') ||
          !logContent.includes('SUCCESS: All tests completed cleanly.');

        const exitCode = code === 0 && !logFailed ? 0 : 1;
        resolve(exitCode);
      });
    });
  }
}
