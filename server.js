const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '8001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// MIME 类型映射
const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8'
};

const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin'
};

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const server = http.createServer((req, res) => {
    // 全局安全响应头
    for (const [k, v] of Object.entries(securityHeaders)) {
        res.setHeader(k, v);
    }
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");

    // 解析 URL (WHATWG)
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = parsedUrl.pathname;

    // 移除开头的斜杠
    if (pathname.startsWith('/')) {
        pathname = pathname.slice(1);
    }

    // 默认文件
    if (pathname === '' || pathname === '/') {
        pathname = 'index.html';
    }

    // 自定义覆盖层索引
    if (pathname === 'custom/index.json') {
        const customDir = path.join(__dirname, 'custom');
        fs.readdir(customDir, { withFileTypes: true }, (err, entries) => {
            const now = new Date().toISOString();
            if (err) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ files: [], updatedAt: now }));
                return;
            }
            const files = entries
                .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.json'))
                .map(e => e.name);
            const listStats = files.map(name => {
                try {
                    const st = fs.statSync(path.join(customDir, name));
                    return { name, mtime: st.mtime.toISOString(), size: st.size };
                } catch {
                    return { name, mtime: now, size: 0 };
                }
            }).sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ files: listStats, updatedAt: now }));
        });
        return;
    }

    // 自定义覆盖层上传（仅本机可用）
    if (pathname === 'custom/upload' && (req.method === 'POST' || req.method === 'PUT')) {
        const addr = (req.socket && req.socket.remoteAddress) || '';
        const isLocal = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
        if (!isLocal) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
            return;
        }
        const qName = parsedUrl.searchParams.get('name') || `overlay_${Date.now()}.json`;
        let safeName = qName.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (!safeName.toLowerCase().endsWith('.json')) safeName += '.json';
        const customDir = path.join(__dirname, 'custom');
        const target = path.join(customDir, safeName);

        let body = Buffer.alloc(0);
        const MAX = 2 * 1024 * 1024; // 2MB
        req.on('data', chunk => {
            body = Buffer.concat([body, chunk]);
            if (body.length > MAX) {
                res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
                req.destroy();
            }
        });
        req.on('end', () => {
            const txt = body.toString('utf-8');
            try {
                const parsed = JSON.parse(txt);
                if (!(Array.isArray(parsed) || (parsed && Array.isArray(parsed.items)))) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false, error: 'invalid format' }));
                    return;
                }
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
                return;
            }
            fs.mkdir(customDir, { recursive: true }, (mErr) => {
                if (mErr) {
                    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false, error: 'mkdir failed' }));
                    return;
                }
                fs.writeFile(target, txt, 'utf-8', (wErr) => {
                    if (wErr) {
                        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'write failed' }));
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                    res.end(JSON.stringify({ ok: true, name: safeName }));
                });
            });
        });
        return;
    }

    // 构建文件路径
    const filePath = path.join(__dirname, pathname);

    // 安全检查：防止目录遍历
    const realPath = path.resolve(filePath);
    const baseDir = path.resolve(__dirname);
    
    if (!realPath.startsWith(baseDir)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
    }

    // 文件信息与缓存策略
    fs.stat(filePath, (statErr, stats) => {
        if (statErr) {
            if (statErr.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(`
                    <!DOCTYPE html>
                    <html lang="zh-CN">
                    <head>
                        <meta charset="UTF-8">
                        <title>404 Not Found</title>
                    </head>
                    <body>
                        <h1>404 - 文件未找到</h1>
                        <p>请求的文件不存在：${escapeHtml(pathname)}</p>
                    </body>
                    </html>
                `);
                return;
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end('500 Internal Server Error');
                return;
            }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const isHtml = ext === '.html';
        const longCacheExts = new Set(['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot']);
        const cacheControl = isHtml ? 'no-store' : (longCacheExts.has(ext) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
        const lastModified = stats.mtime.toUTCString();

        if (req.method === 'HEAD') {
            res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheControl, 'Last-Modified': lastModified });
            res.end();
            return;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end('500 Internal Server Error');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheControl, 'Last-Modified': lastModified });
            res.end(data);
        });
    });
});

server.listen(PORT, HOST, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║     AI 知识复习小程序 - 服务器已启动                      ║
╚════════════════════════════════════════════════════════════╝

📱 访问地址：
   电脑：http://localhost:${PORT}
   手机：http://<你的电脑IP>:${PORT}

💡 示例：
   http://<你的电脑IP>:${PORT}

⚠️  按 Ctrl+C 停止服务器

════════════════════════════════════════════════════════════
    `);
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n\n服务器已停止');
    process.exit(0);
});
