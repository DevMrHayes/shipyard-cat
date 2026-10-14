import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  build: {
    emptyOutDir: false,
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      ignored: [
        '**/*.mp3',
        '**/*.wav',
        '**/*.ogg',
        '**/*.glb',
        '**/*.hdr',
        '**/*.jpg',
        '**/*.png',
        '**/*.log',
        '**/.agents/**',
        '**/logs/**',
        '**/dist/**',
      ],
    },
  },
  plugins: [
    {
      name: 'local-game-logger',
      configureServer(server) {
        server.middlewares.use('/api/log', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const logDir = path.resolve(__dirname, '.agents/logs');
                if (!fs.existsSync(logDir)) {
                  fs.mkdirSync(logDir, { recursive: true });
                }
                const logFile = path.join(logDir, 'game_runtime.log');

                const parsed = JSON.parse(body || '{}');
                const entries = parsed.entries || [parsed];
                const now = new Date().toISOString();

                let logBlock = '';
                for (const entry of entries) {
                  logBlock += `[${now}] [${entry.type || 'LOG'}] ${entry.message || ''}\n`;
                  if (entry.details) {
                    logBlock += `  Details: ${JSON.stringify(entry.details)}\n`;
                  }
                  if (entry.stack) {
                    logBlock += `  Stack: ${entry.stack}\n`;
                  }
                  logBlock += `--------------------------------------------------\n`;
                }

                fs.appendFileSync(logFile, logBlock, 'utf8');

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ status: 'ok', count: entries.length }));
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ status: 'error', error: err.message }));
              }
            });
          } else if (req.method === 'GET') {
            // Allow querying the last 100 lines of log
            try {
              const logFile = path.resolve(__dirname, '.agents/logs/game_runtime.log');
              if (fs.existsSync(logFile)) {
                const content = fs.readFileSync(logFile, 'utf8');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/plain');
                res.end(content);
              } else {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/plain');
                res.end('No log entries yet.');
              }
            } catch (err: any) {
              res.statusCode = 500;
              res.end('Error reading log file: ' + err.message);
            }
          } else {
            res.statusCode = 405;
            res.end('Method Not Allowed');
          }
        });
      },
    },
  ],
});
