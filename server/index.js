/**
 * Bypass Relay Server v3 — Combined (WebSocket + HTTP CONNECT + iOS .mobileconfig)
 * Один сервер для Android, Windows и iOS
 */
const { WebSocketServer } = require('ws');
const { createConnection } = require('net');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ========== CONFIG ==========
const PORT = parseInt(process.env.PORT, 10) || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'freebypass2024';
const USE_ENCRYPTION = process.env.USE_ENCRYPTION !== 'false';
const KEY = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || 'bypass-secret-key-2024').digest();

// ========== STATS ==========
const stats = { totalConns: 0, activeConns: 0, bytes: 0, clients: 0, startTime: Date.now() };

// ========== CRYPTO ==========
function encrypt(d) {
  if (!USE_ENCRYPTION) return d;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const e = Buffer.concat([c.update(d), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), e]);
}
function decrypt(d) {
  if (!USE_ENCRYPTION) return d;
  try {
    const c = crypto.createDecipheriv('aes-256-gcm', KEY, d.subarray(0,12));
    c.setAuthTag(d.subarray(12,28));
    return Buffer.concat([c.update(d.subarray(28)), c.final()]);
  } catch { return null; }
}

// ========== PROTOCOL HELPERS ==========
function buildDataMsg(connId, data) {
  const cBuf = Buffer.from(connId, 'utf8');
  const msg = Buffer.alloc(9 + cBuf.length + data.length);
  msg[0] = 0x03;
  msg.writeUInt32BE(cBuf.length, 1);
  cBuf.copy(msg, 5);
  msg.writeUInt32BE(data.length, 5 + cBuf.length);
  data.copy(msg, 9 + cBuf.length);
  return msg;
}
function buildCloseMsg(connId) {
  const cBuf = Buffer.from(connId, 'utf8');
  const msg = Buffer.alloc(5 + cBuf.length);
  msg[0] = 0x04;
  msg.writeUInt32BE(cBuf.length, 1);
  cBuf.copy(msg, 5);
  return msg;
}

// ========== MAIN HTTP SERVER ==========
const server = http.createServer((req, res) => {
  const url = req.url || '/';
  
  // Health endpoint
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: Math.floor((Date.now() - stats.startTime) / 1000),
      clients: stats.clients,
      activeConns: stats.activeConns,
      totalConns: stats.totalConns,
      bytes: stats.bytes,
      encryption: USE_ENCRYPTION,
      version: 3,
      protocols: ['websocket', 'http_connect', 'mobileconfig']
    }));
    return;
  }
  
  // APK download - try multiple paths
  if (url === '/apk' || url.endsWith('.apk')) {
    const apkName = path.basename(url);
    const searchPaths = [
      path.join(__dirname, apkName),
      path.join(__dirname, '..', apkName),
      path.join(process.cwd(), apkName),
      path.join(process.cwd(), 'server', apkName)
    ];
    let apkPath = null;
    for (const p of searchPaths) {
      if (fs.existsSync(p)) { apkPath = p; break; }
    }
    if (apkPath) {
      const stat = fs.statSync(apkPath);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': stat.size,
        'Content-Disposition': 'attachment; filename="' + apkName + '"'
      });
      fs.createReadStream(apkPath).pipe(res);
    } else {
      res.writeHead(404, {'Content-Type':'text/plain'});
      res.end('APK not found - checked: ' + JSON.stringify(searchPaths));
    }
    return;
  }

  // iOS .mobileconfig download
  if (url === '/bypass.mobileconfig' || url === '/mobileconfig') {
    res.writeHead(200, {
      'Content-Type': 'application/x-apple.aspen-config',
      'Content-Disposition': 'attachment; filename="BypassVPN.mobileconfig"'
    });
    res.end(generateMobileConfig(req));
    return;
  }
  
  // iOS setup page
  if (url === '/ios' || url === '/ios.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(generateIOSPage(req));
    return;
  }
  
  // Root page
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(generateRootPage(req));
});

// ========== HTTP CONNECT PROXY (for iOS) ==========
server.on('connect', (req, client, head) => {
  const [host, port] = req.url.split(':');
  const targetPort = parseInt(port) || 443;
  const connId = 'i' + uuidv4().slice(0, 8);
  
  // Connect to target via WebSocket relay
  const sock = createConnection(targetPort, host, () => {
    // Accept the CONNECT request
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    
    // Forward any initial data
    if (head.length > 0) {
      sock.write(head);
    }
    
    // Bidirectional forwarding
    client.on('data', (chunk) => sock.write(chunk));
    sock.on('data', (chunk) => {
      if (client.writable) client.write(chunk);
    });
    
    client.on('close', () => sock.destroy());
    sock.on('close', () => { try { client.end(); } catch(e) {} });
    client.on('error', () => sock.destroy());
    sock.on('error', () => { try { client.end(); } catch(e) {} });
  });
  
  sock.on('error', (e) => {
    try { client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch(err) {}
  });
  
  // Timeout
  sock.setTimeout(300000);
});

// ========== WEBSOCKET RELAY (for Android/Windows) ==========
const wss = new WebSocketServer({ server });
server.listen(PORT, () => console.log(`✅ Bypass Relay v3 on :${PORT} | encryption=${USE_ENCRYPTION} | iOS: http://0.0.0.0:${PORT}/ios`));

wss.on('connection', (ws, req) => {
  const cid = uuidv4().slice(0, 6);
  let authed = false;
  const conns = new Map();
  const pi = setInterval(() => { try { ws.ping(); } catch {} }, 30000);
  stats.clients++;
  
  const send = (d) => { try { ws.send(encrypt(d)); } catch {} };
  
  // TCP connection manager via WebSocket relay
  const handleConnect = (payload) => {
    try {
      const hLen = payload.readUInt32BE(0);
      const host = payload.subarray(4, 4 + hLen).toString('utf8');
      const port = payload.readUInt16BE(4 + hLen);
      const connId = uuidv4().slice(0, 8);
      
      const sock = createConnection(port, host, () => {
        conns.set(connId, { socket: sock, host, port });
        stats.totalConns++;
        stats.activeConns++;
        const cBuf = Buffer.from(connId, 'utf8');
        const resp = Buffer.alloc(6 + cBuf.length);
        resp[0] = 0x08;
        resp.writeUInt32BE(cBuf.length, 1);
        cBuf.copy(resp, 5);
        resp[5 + cBuf.length] = 1;
        send(resp);
      });
      
      sock.setTimeout(300000);
      sock.setKeepAlive(true, 60000);
      
      sock.on('data', (chunk) => {
        const msg = buildDataMsg(connId, chunk);
        send(msg);
        stats.bytes += chunk.length;
      });
      
      sock.on('error', () => closeConn(connId));
      sock.on('close', () => closeConn(connId));
    } catch (e) {}
  };
  
  ws.on('message', (raw) => {
    const data = decrypt(Buffer.from(raw));
    if (!data) return;
    const type = data[0];
    const payload = data.subarray(1);
    
    if (!authed && type !== 0x01) {
      send(Buffer.from([0x05]));
      return;
    }
    
    switch (type) {
      case 0x01: { // AUTH
        const token = payload.toString('utf8').trim();
        authed = token === AUTH_TOKEN;
        send(Buffer.from([authed ? 0x06 : 0x07]));
        break;
      }
      case 0x02: handleConnect(payload); break; // CONNECT
      case 0x03: { // DATA
        try {
          const cLen = payload.readUInt32BE(0);
          const cId = payload.subarray(4, 4 + cLen).toString('utf8');
          const dLen = payload.readUInt32BE(4 + cLen);
          const d = payload.subarray(8 + cLen, 8 + cLen + dLen);
          conns.get(cId)?.socket?.write(d);
          stats.bytes += d.length;
        } catch (e) {}
        break;
      }
      case 0x04: { // CLOSE
        try {
          closeConn(payload.subarray(4, 4 + payload.readUInt32BE(0)).toString('utf8'));
        } catch (e) {}
        break;
      }
    }
  });
  
  ws.on('close', () => {
    clearInterval(pi);
    for (const [id, c] of conns) {
      c.socket.destroy();
      stats.activeConns--;
    }
    conns.clear();
  });
  
  ws.on('error', () => {
    clearInterval(pi);
  });
  
  function closeConn(connId) {
    const conn = conns.get(connId);
    if (!conn) return;
    conn.socket.destroy();
    conns.delete(connId);
    stats.activeConns--;
    const msg = buildCloseMsg(connId);
    send(msg);
  }
});

// ========== PAGE GENERATORS ==========
function generateMobileConfig(req) {
  const host = req.headers['host'] || 'localhost:3000';
  const name = 'BypassVPN';
  const org = 'Bypass VPN';
  const uuid = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'; // Will be replaced on download
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadDescription</key>
            <string>Configures HTTP proxy for BypassVPN</string>
            <key>PayloadDisplayName</key>
            <string>BypassVPN Proxy</string>
            <key>PayloadIdentifier</key>
            <string>com.bypass.vpn.proxy.${uuidv4().slice(0,8)}</string>
            <key>PayloadType</key>
            <string>com.apple.proxy.http.global</string>
            <key>PayloadUUID</key>
            <string>${uuidv4().toUpperCase()}</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>Proxies</key>
            <dict>
                <key>HTTPEnable</key>
                <integer>1</integer>
                <key>HTTPProxy</key>
                <string>${host.split(':')[0]}</string>
                <key>HTTPPort</key>
                <integer>${parseInt(host.split(':')[1]) || PORT}</integer>
                <key>HTTPSEnable</key>
                <integer>1</integer>
                <key>HTTPSProxy</key>
                <string>${host.split(':')[0]}</string>
                <key>HTTPSPort</key>
                <integer>${parseInt(host.split(':')[1]) || PORT}</integer>
            </dict>
        </dict>
    </array>
    <key>PayloadDescription</key>
    <string>Автоматическая настройка HTTP прокси для обхода блокировок. Сервер: ${host}</string>
    <key>PayloadDisplayName</key>
    <string>BypassVPN - Обход блокировок</string>
    <key>PayloadIdentifier</key>
    <string>com.bypass.vpn.${uuidv4().slice(0,8)}</string>
    <key>PayloadOrganization</key>
    <string>Bypass VPN</string>
    <key>PayloadRemovalDisallowed</key>
    <false/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>${uuidv4().toUpperCase()}</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>`;
}

function generateIOSPage(req) {
  const host = req.headers['host'] || 'SERVER_IP:3000';
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BypassVPN — iOS настройка</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, system-ui, sans-serif; background: #0a0a0a; color: #fff; line-height: 1.6; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
h1 { font-size: 28px; margin: 20px 0 10px; color: #4CAF50; }
h2 { font-size: 20px; margin: 20px 0 10px; color: #81C784; }
p { margin: 10px 0; color: #b0b0b0; }
.step { background: #1a1a2e; border-radius: 12px; padding: 16px; margin: 12px 0; border-left: 4px solid #4CAF50; }
.step h3 { color: #4CAF50; margin-bottom: 8px; }
.step p { margin: 4px 0; }
code { background: #2a2a3e; padding: 2px 8px; border-radius: 4px; font-size: 14px; color: #ff9800; }
.btn { display: inline-block; background: #4CAF50; color: #fff; padding: 14px 28px; border-radius: 8px; 
  text-decoration: none; font-size: 18px; font-weight: bold; margin: 10px 0; }
.btn:hover { background: #45a049; }
.status { background: #1a1a2e; border-radius: 12px; padding: 16px; margin: 12px 0; text-align: center; }
.status.online { border-left: 4px solid #4CAF50; }
.status.offline { border-left: 4px solid #f44336; }
.status .dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; }
.status .dot.green { background: #4CAF50; }
.status .dot.red { background: #f44336; }
.server-info { background: #1a1a2e; border-radius: 8px; padding: 12px; margin: 10px 0; font-family: monospace; }
.server-info span { color: #81C784; }
.footer { text-align: center; margin: 30px 0; font-size: 12px; color: #555; }
</style>
</head>
<body>
<div class="container">
  <h1>🍎 BypassVPN для iOS</h1>
  
  <div class="status online">
    <p><span class="dot green"></span> Сервер работает: <strong>${host}</strong></p>
    <p style="font-size:12px;color:#888;">uptime: ${Math.floor((Date.now()-stats.startTime)/1000)}s | clients: ${stats.clients}</p>
  </div>
  
  <p>Настройка занимает 1 минуту. Не требуется джейлбрейк или App Store.</p>
  
  <h2>📲 Быстрая настройка (авто)</h2>
  <div class="step">
    <h3>Шаг 1: Скачайте профиль</h3>
    <a href="/bypass.mobileconfig" class="btn">⬇ Скачать .mobileconfig</a>
    <p>Нажмите, чтобы скачать профиль настройки</p>
  </div>
  
  <div class="step">
    <h3>Шаг 2: Установите профиль</h3>
    <p>1. Откройте <strong>Настройки</strong> → <strong>Основные</strong> → <strong>VPN и управление устройством</strong></p>
    <p>2. Нажмите на профиль "BypassVPN"</p>
    <p>3. Нажмите <strong>"Установить"</strong> в правом верхнем углу</p>
    <p>4. Введите пароль от телефона</p>
    <p>5. Подтвердите установку</p>
  </div>
  
  <div class="step">
    <h3>Шаг 3: Активируйте прокси</h3>
    <p>Профиль автоматически настроит HTTP прокси для всех сетей Wi-Fi.</p>
    <p>Просто подключитесь к любой Wi-Fi сети — прокси работает автоматически.</p>
    <p><strong>Готово!</strong> Открывайте Safari — YouTube, Instagram, Google работают!</p>
  </div>
  
  <h2>🔧 Ручная настройка</h2>
  <div class="step">
    <h3>Если авто-профиль не установился:</h3>
    <p>1. <strong>Настройки</strong> → <strong>Wi-Fi</strong></p>
    <p>2. Нажмите <strong>(i)</strong> рядом с вашей сетью</p>
    <p>3. Прокрутите вниз до <strong>HTTP-прокси</strong></p>
    <p>4. Выберите <strong>Вручную</strong></p>
    <p>5. Сервер: <code>${host.split(':')[0]}</code></p>
    <p>6. Порт: <code>${parseInt(host.split(':')[1]) || PORT}</code></p>
    <p>7. Аутентификация: <strong>Выкл</strong></p>
  </div>
  
  <h2>🌐 Что работает</h2>
  <div class="step">
    <p>✅ <strong>YouTube</strong> — m.youtube.com, youtube.com</p>
    <p>✅ <strong>Instagram</strong> — instagram.com</p>
    <p>✅ <strong>Google</strong> — google.com, gmail.com</p>
    <p>✅ <strong>Manus</strong> — manus.im</p>
    <p>✅ Все остальные заблокированные сайты</p>
  </div>
  
  <h2>💻 Данные сервера</h2>
  <div class="server-info">
    <p><span>Server:</span> ${host}</p>
    <p><span>Token:</span> ${AUTH_TOKEN}</p>
    <p><span>Encryption:</span> ${USE_ENCRYPTION ? 'AES-256-GCM' : 'OFF (fast)'}</p>
    <p><span>Protocol:</span> HTTP CONNECT Proxy</p>
  </div>
  
  <div class="footer">
    <p>BypassVPN v3 | Работает на любом iOS устройстве</p>
    <p>Сделано для обхода региональных блокировок</p>
  </div>
</div>
</body>
</html>`;
}

function generateRootPage(req) {
  const host = req.headers['host'] || 'localhost:3000';
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BypassVPN Relay v3</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,system-ui,sans-serif; background:#0a0a0a; color:#fff; padding:40px 20px; text-align:center; }
h1 { color:#4CAF50; font-size:32px; }
.card { background:#1a1a2e; border-radius:12px; padding:20px; margin:15px auto; max-width:500px; }
.btn { display:inline-block; background:#4CAF50; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; margin:5px; }
</style>
</head>
<body>
<h1>🚀 BypassVPN v3</h1>
<p>Релей-сервер для обхода блокировок</p>
<div class="card">
  <p>📱 <a href="/ios" style="color:#81C784;">iOS настройка</a></p>
  <p>🤖 Android APK готов</p>
  <p>📥 <a href="/bypassvpn-tabs10.apk" style="color:#81C784;">Скачать APK</a></p></p>
  <p>🪟 Windows .exe готов</p>
</div>
<div class="card">
  <p>Статус: <strong style="color:#4CAF50;">ONLINE</strong></p>
  <p>uptime: ${Math.floor((Date.now()-stats.startTime)/1000)}s</p>
  <p>клиентов: ${stats.clients}</p>
</div>
</body>
</html>`;
}
