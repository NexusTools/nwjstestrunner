import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { TestHttpServerOptions } from '../types/test-runner-types';

const DEFAULT_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

export class TestHttpServer {
  private readonly options: TestHttpServerOptions;
  private server: http.Server | null = null;
  private boundPort = 0;

  constructor(options: TestHttpServerOptions) {
    this.options = options;
  }

  public getPort(): number {
    return this.boundPort;
  }

  public getBaseUrl(): string {
    const host = this.options.host || '127.0.0.1';
    return `http://${host}:${this.boundPort}`;
  }

  public async start(): Promise<number> {
    if (this.server && this.boundPort > 0) {
      return this.boundPort;
    }

    const projectRootDir = path.resolve(this.options.projectRootDir);
    const defaultEntry = this.options.defaultEntryFile || 'index.html';
    const host = this.options.host || '127.0.0.1';
    const port = this.options.port ?? 0;
    const ignore404 = new Set(this.options.ignore404Paths ?? ['/favicon.ico']);
    const mimeTypes: Record<string, string> = {
      ...DEFAULT_MIME_TYPES,
      ...(this.options.customMimeTypes || {})
    };

    this.server = http.createServer(async (req, res) => {
      try {
        const reqUrl = req.url || '/';
        const rawPath = reqUrl.split('?')[0] || '/';
        const reqPath = decodeURIComponent(rawPath);

        if (this.options.routeHandler) {
          const handled = await this.options.routeHandler(req, res, {
            projectRootDir,
            reqPath,
            reqUrl
          });
          if (handled === true || res.writableEnded || res.headersSent) {
            return;
          }
        }

        const relPath =
          reqPath === '/'
            ? defaultEntry
            : reqPath.startsWith('/')
              ? reqPath.slice(1)
              : reqPath;
        const filePath = path.resolve(projectRootDir, relPath);

        // Guard against directory traversal outside projectRootDir
        const normalizedRoot = projectRootDir.endsWith(path.sep)
          ? projectRootDir
          : projectRootDir + path.sep;
        const isInsideProject =
          filePath === projectRootDir || filePath.startsWith(normalizedRoot);

        if (
          isInsideProject &&
          relPath &&
          fs.existsSync(filePath) &&
          fs.statSync(filePath).isFile()
        ) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
          });
          fs.createReadStream(filePath).pipe(res);
          return;
        }

        if (!ignore404.has(reqPath) && this.options.onHttp404) {
          this.options.onHttp404(reqPath, filePath);
        }

        res.writeHead(404, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(`404 Not Found: ${reqPath}`);
      } catch (err: any) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end(`500 Internal Server Error: ${err?.message || String(err)}`);
      }
    });

    return new Promise<number>((resolve, reject) => {
      if (!this.server) {
        reject(new Error('HTTP server not created'));
        return;
      }
      this.server.once('error', (err) => reject(err));
      this.server.listen(port, host, () => {
        const addr = this.server?.address();
        if (addr && typeof addr === 'object') {
          this.boundPort = addr.port;
          resolve(this.boundPort);
        } else {
          reject(new Error('Failed to resolve bound port for TestHttpServer'));
        }
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.server) return;
    const srv = this.server;
    this.server = null;
    this.boundPort = 0;
    return new Promise<void>((resolve) => {
      try {
        srv.close(() => resolve());
      } catch (_e) {
        resolve();
      }
    });
  }
}
