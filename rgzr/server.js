const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8001;
const HOST = '0.0.0.0';

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

const server = http.createServer((req, res) => {
    // 解析 URL
    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname;

    // 移除开头的斜杠
    if (pathname.startsWith('/')) {
        pathname = pathname.slice(1);
    }

    // 默认文件
    if (pathname === '' || pathname === '/') {
        pathname = 'index.html';
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

    // 读取文件
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`
                    <!DOCTYPE html>
                    <html lang="zh-CN">
                    <head>
                        <meta charset="UTF-8">
                        <title>404 Not Found</title>
                    </head>
                    <body>
                        <h1>404 - 文件未找到</h1>
                        <p>请求的文件不存在：${pathname}</p>
                    </body>
                    </html>
                `);
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('500 Internal Server Error');
            }
        } else {
            // 获取文件扩展名
            const ext = path.extname(filePath).toLowerCase();
            const contentType = mimeTypes[ext] || 'application/octet-stream';

            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
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
   http://192.168.1.108:${PORT}

⚠️  按 Ctrl+C 停止服务器

════════════════════════════════════════════════════════════
    `);
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n\n服务器已停止');
    process.exit(0);
});
