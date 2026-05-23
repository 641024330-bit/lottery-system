const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'data.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== 获取对外IP =====
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}
const HOST = process.env.HOST || getLocalIP();
const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || `http://${HOST}:${PORT}`;

// ===== 数据存储 =====
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch(e) { return { participants: [], winners: {}, prizes: [], drawLog: [] }; }
}
function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== API: 用户参与 =====
app.post('/api/join', (req, res) => {
  const { nickname, phone } = req.body;
  if (!nickname || !phone) {
    return res.json({ success: false, message: '请填写姓名和手机号' });
  }
  if (!/^1\d{10}$/.test(phone)) {
    return res.json({ success: false, message: '手机号格式不正确' });
  }
  const data = loadData();
  if (data.participants.some(p => p.phone === phone)) {
    return res.json({ success: false, message: '您已经参与过了' });
  }
  const user = {
    id: 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    nickname: nickname.trim(),
    phone,
    joinTime: new Date().toISOString(),
  };
  data.participants.push(user);
  saveData(data);
  res.json({ success: true, message: '参与成功！' });
});

// ===== API: 参与者列表 =====
app.get('/api/participants', (req, res) => {
  const data = loadData();
  res.json({ success: true, data: data.participants, total: data.participants.length });
});

// ===== API: 设置奖项 =====
app.post('/api/prizes', (req, res) => {
  const { prizes } = req.body;
  if (!prizes || !Array.isArray(prizes)) {
    return res.json({ success: false, message: '参数错误' });
  }
  const data = loadData();
  data.prizes = prizes.map(p => ({
    name: p.name,
    count: parseInt(p.count) || 1,
    winners: data.prizes.find(op => op.name === p.name)?.winners || [],
  }));
  saveData(data);
  res.json({ success: true, data: data.prizes });
});

// ===== API: 获取奖项 =====
app.get('/api/prizes', (req, res) => {
  const data = loadData();
  if (!data.prizes || data.prizes.length === 0) {
    data.prizes = [
      { name: '特等奖', count: 1, winners: [] },
      { name: '一等奖', count: 3, winners: [] },
      { name: '二等奖', count: 5, winners: [] },
      { name: '三等奖', count: 10, winners: [] },
    ];
    saveData(data);
  }
  res.json({ success: true, data: data.prizes });
});

// ===== API: 抽奖 =====
app.post('/api/draw', (req, res) => {
  const { prizeName } = req.body;
  const data = loadData();
  const prize = data.prizes.find(p => p.name === prizeName);
  if (!prize) return res.json({ success: false, message: '奖项不存在' });

  const remaining = prize.count - prize.winners.length;
  if (remaining <= 0) return res.json({ success: false, message: '该奖项已抽完' });

  const allWinners = new Set();
  data.prizes.forEach(p => p.winners.forEach(w => allWinners.add(w.id)));
  const available = data.participants.filter(p => !allWinners.has(p.id));
  if (available.length === 0) return res.json({ success: false, message: '没有可抽奖的参与者' });

  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, Math.min(1, remaining));

  winners.forEach(w => {
    prize.winners.push({ id: w.id, nickname: w.nickname, phone: w.phone });
  });
  data.drawLog.push({
    prize: prizeName,
    winners: winners.map(w => ({ id: w.id, nickname: w.nickname })),
    time: new Date().toISOString(),
  });
  saveData(data);

  res.json({ success: true, winners: winners.map(w => ({ id: w.id, nickname: w.nickname })) });
});

// ===== API: 中奖名单 =====
app.get('/api/winners', (req, res) => {
  const data = loadData();
  res.json({ success: true, data: data.prizes.filter(p => p.winners.length > 0) });
});

// ===== API: 重置 =====
app.post('/api/reset', (req, res) => {
  const data = loadData();
  data.prizes.forEach(p => p.winners = []);
  data.drawLog = [];
  saveData(data);
  res.json({ success: true, message: '已重置' });
});

// ===== 获取当前公网URL =====
function getPublicUrl(req) {
  // 优先使用环境变量
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  // 从请求头检测公网域名
  const host = req.get('host');
  const forwardedHost = req.get('x-forwarded-host');
  const useHost = forwardedHost || host;
  if (useHost && !useHost.includes('localhost') && !useHost.includes('127.0.0.1') && !useHost.includes('192.168')) {
    return `https://${useHost}`;
  }
  // 尝试从 x-forwarded-proto 和 host 构建
  const proto = req.get('x-forwarded-proto') || 'http';
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return `${proto}://${host}`;
  }
  return BASE_URL;
}

// ===== API: 二维码 =====
app.get('/api/qrcode', async (req, res) => {
  try {
    const url = `${getPublicUrl(req)}/join.html`;
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
    res.json({ success: true, qrcode: qr, url });
  } catch(e) {
    res.json({ success: false, message: e.message });
  }
});

// ===== API: 直接返回二维码图片 =====
app.get('/api/qrcode.png', async (req, res) => {
  try {
    const url = `${getPublicUrl(req)}/join.html`;
    const buf = await QRCode.toBuffer(url, { width: 400, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
    res.type('png').send(buf);
  } catch(e) {
    res.status(500).send('Error');
  }
});

// ===== API: 系统状态 =====
app.get('/api/status', (req, res) => {
  const data = loadData();
  const allWinners = new Set();
  data.prizes.forEach(p => p.winners.forEach(w => allWinners.add(w.id)));
  res.json({
    success: true,
    data: {
      totalParticipants: data.participants.length,
      totalWinners: allWinners.size,
      prizes: data.prizes.map(p => ({ name: p.name, count: p.count, drawn: p.winners.length })),
    }
  });
});

// ===== 启动 =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║         年会抽奖系统 v2.0                ║
  ╠══════════════════════════════════════════╣
  ║  公网: ${BASE_URL}${BASE_URL.length < 35 ? ' '.repeat(35 - BASE_URL.length) : ''}║
  ║  扫码: ${BASE_URL}/join.html${BASE_URL.length < 31 ? ' '.repeat(31 - BASE_URL.length) : ''}║
  ╠══════════════════════════════════════════╣
  ║  部署到公网时自动可用, 局域网也可用       ║
  ╚══════════════════════════════════════════╝
  `);
});
