const ref = require('ref-napi');
const ffi = require('ffi-napi');
const process = require('node:process');
const net = require('node:net');
const http = require('node:http');
const path = require('path');

// 定义类型
const tailscale_listener_ptr = ref.refType(ref.types.int);
const tailscale_conn_ptr = ref.refType(ref.types.int);
const char_ptr = ref.refType(ref.types.char);

// 加载libtailscale库
const Tailscale = ffi.Library(path.join(__dirname, 'libtailscale'), {
    "TsnetNewServer": ['int', []],
    "TsnetUp": ['int', ['int']],
    "TsnetClose": ['int', ['int']],
    "TsnetSetControlURL": ['int', ['int', 'string']],
    "TsnetSetEphemeral": ['int', ['int', 'int']],
    "TsnetSetAuthKey": ['int', ['int', 'string']],
    "TsnetListen": ['int', ['int', 'string', 'string', tailscale_listener_ptr]],
    "TsnetAccept": ['int', ['int', tailscale_conn_ptr]],
    "TsnetErrmsg": ['int', ['int', char_ptr, 'int']],
});

// 创建Tailscale服务器
const tailscale = Tailscale.TsnetNewServer();
// Tailscale.TsnetSetAuthKey(tailscale, "<auth_key>");
// Tailscale.TsnetSetControlURL(tailscale, "https://headscale.dev.ffd.scapps.io");


process.on('exit', (code) => {
    console.log(`About to exit with code: ${code}`);
    Tailscale.TsnetClose(tailscale);
});

// 启动Tailscale
console.log("Calling TsnetUp...");
const upResult = Tailscale.TsnetUp(tailscale);
console.log("TsnetUp result:", upResult);

if (upResult != 0) {
    console.log("TsnetUp failed, getting error message...");
    err();
}

// 监听端口
const lnBuf = ref.alloc('int');
const listenResult = Tailscale.TsnetListen(tailscale, "tcp", "1999", lnBuf);
console.log("TsnetListen result:", listenResult);
const ln = lnBuf.deref();
console.log("TsnetListen listener:", ln);

// 错误处理函数
function err() {
    const buffer = Buffer.alloc(2000);
    Tailscale.TsnetErrmsg(tailscale, buffer, 2000);
    const errorMessage = ref.readCString(buffer, 0);
    console.log('=====================');
    console.log(errorMessage);
    console.log('=====================');
}

// 创建HTTP服务器
const server = http.createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello World\n');
});

const PORT = 3000;
const HOST = 'localhost'; // 等价于 127.0.0.1，仅本地可访问；改为 '0.0.0.0' 可局域网访问



// 3. 注册 error 事件回调，捕获监听失败的错误（关键：避免静默退出）
server.on('error', (err) => {
    console.error('HTTP 服务启动失败：', err.message);
});

// 接受连接
function accept() {
    console.log("Waiting for connection...");
    const connRef = ref.alloc('int');
    Tailscale.TsnetAccept.async(ln, connRef, function (error, result) {
        console.log("JS - accepting");
        console.log("JS - result: " + result);
        const conn = connRef.deref();
        console.log("JS - conn: " + conn);
        
        if (error) {
            console.log("JS - ERROR: " + error);
            err();
        } else {
            // 创建Node.js Socket对象
            const socket = new net.Socket({
                fd: conn,
                readable: true,
                writable: true,
                allowHalfOpen: false
            });
            
            console.log("JS - socket: " + socket);
            server.emit('connection', socket);
            console.log("JS - emitted");
            console.log('JS - Connection established');
        }
        
        // 继续接受下一个连接
        setTimeout(accept, 100);
    });
}
accept()
// 捕获SIGINT和SIGTERM信号，优雅关闭
process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    Tailscale.TsnetClose(tailscale);
    setTimeout(() => {
        process.exit(0);
    }, 1000);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    Tailscale.TsnetClose(tailscale);
    setTimeout(() => {
        process.exit(0);
    }, 1000);
});

server.listen(PORT, HOST, () => {
    // 监听成功的回调函数（异步）
    console.log(`HTTP 服务已启动，正在监听：http://${HOST}:${PORT}`);
});