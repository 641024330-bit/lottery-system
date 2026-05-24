const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'data.json');
const BG_DIR = path.join(__dirname, 'public', 'backgrounds');
const AUDIO_DIR = path.join(__dirname, 'public', 'audio');
const QR_DIR = path.join(__dirname, 'public', 'qrcodes');

app.use(express.json());
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

// 确保目录存在
fs.mkdirSync(BG_DIR, { recursive: true });
fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(QR_DIR, { recursive: true });

// ===== 默认设置 =====
const DEFAULT_SETTINGS = {
  title: '🎯 年会抽奖',
  subtitle: '现场大屏抽奖系统',
  primaryColor: '#ffd700',
  bgType: 'color', // color | image | preset
  bgColor: '#0f0f23',
  bgImage: '',
  bgOverlay: 0.6,
  animationStyle: 'roll', // roll | card | slot | highlight
  drawMode: 'single', // single | batch
  batchCount: 3,
  bgmUrl: '',
  bgmEnabled: true,
  qrImage: '',
  wechatAppId: 'wx1521cfbc808a2cdc',
  wechatAppSecret: 'abbfce5b51b93a6f88bfedae4f06930e',
  joinMethod: 'form', // form | wechat | both
};

// ===== 数据存储 =====
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch (e) {
    return { participants: [], winners: {}, prizes: [], drawLog: [], settings: { ...DEFAULT_SETTINGS } };
  }
}
function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== 上传背景图 =====
app.post('/api/upload-bg', express.raw({ limit: '10mb', type: 'image/*' }), (req, res) => {
  try {
    const ext = path.extname(req.headers['content-type'] === 'image/png' ? '.png' : '.jpg') || '.jpg';
    const name = 'bg_' + Date.now() + ext;
    fs.writeFileSync(path.join(BG_DIR, name), req.body);
    res.json({ success: true, url: `/backgrounds/${name}`, name });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ===== 获取背景列表 =====
app.get('/api/backgrounds', (req, res) => {
  try {
    const files = fs.readdirSync(BG_DIR).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    res.json({ success: true, data: files.map(f => ({ name: f, url: `/backgrounds/${f}` })) });
  } catch (e) {
    res.json({ success: false, data: [] });
  }
});

// ===== 删除背景 =====
app.post('/api/delete-bg', (req, res) => {
  try {
    const { name } = req.body;
    if (name) fs.unlinkSync(path.join(BG_DIR, name));
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ===== 上传音频(BGM) =====
app.post('/api/upload-audio', express.raw({ limit: '20mb', type: 'audio/*' }), (req, res) => {
  try {
    const ct = req.headers['content-type'] || '';
    const extMap = { 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg', 'audio/mp4': '.mp4', 'audio/aac': '.aac', 'audio/flac': '.flac' };
    const ext = extMap[ct] || '.mp3';
    const name = 'bgm_' + Date.now() + ext;
    fs.writeFileSync(path.join(AUDIO_DIR, name), req.body);
    res.json({ success: true, url: `/audio/${name}`, name });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ===== 获取音频列表 =====
app.get('/api/audio-list', (req, res) => {
  try {
    const files = fs.readdirSync(AUDIO_DIR).filter(f => /\.(mp3|wav|ogg|mp4|aac|flac)$/i.test(f));
    res.json({ success: true, data: files.map(f => ({ name: f, url: `/audio/${f}` })) });
  } catch (e) {
    res.json({ success: false, data: [] });
  }
});

// ===== 上传自定义二维码 =====
app.post('/api/upload-qr', express.raw({ limit: '5mb', type: 'image/*' }), (req, res) => {
  try {
    // 删除旧二维码
    if (fs.existsSync(QR_DIR)) {
      fs.readdirSync(QR_DIR).forEach(f => fs.unlinkSync(path.join(QR_DIR, f)));
    }
    const ext = req.headers['content-type'] === 'image/png' ? '.png' : '.jpg';
    const name = 'qr_custom' + ext;
    fs.writeFileSync(path.join(QR_DIR, name), req.body);
    res.json({ success: true, url: `/qrcodes/${name}`, name });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ===== 设置管理 =====
app.get('/api/settings', (req, res) => {
  const data = loadData();
  if (!data.settings) data.settings = { ...DEFAULT_SETTINGS };
  // 不返回密钥
  const s = { ...data.settings };
  res.json({ success: true, data: s });
});

app.post('/api/settings', (req, res) => {
  const data = loadData();
  if (!data.settings) data.settings = { ...DEFAULT_SETTINGS };
  Object.assign(data.settings, req.body);
  saveData(data);
  const s = { ...data.settings };
  res.json({ success: true, data: s });
});

// ===== 微信OAuth回调 =====
app.get('/api/wechat/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/join.html?auth=fail');

  const data = loadData();
  const { wechatAppId, wechatAppSecret } = data.settings || {};

  if (!wechatAppId || !wechatAppSecret) {
    return res.redirect('/join.html?auth=fail');
  }

  try {
    // 获取access_token
    const tokenRes = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${wechatAppId}&secret=${wechatAppSecret}&code=${code}&grant_type=authorization_code`
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.redirect('/join.html?auth=fail');
    }

    // 获取用户信息
    const userRes = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${tokenData.access_token}&openid=${tokenData.openid}&lang=zh_CN`
    );
    const userInfo = await userRes.json();

    if (!userInfo.nickname) {
      return res.redirect('/join.html?auth=fail');
    }

    // 自动注册
    const participants = data.participants;
    if (participants.some(p => p.openid === userInfo.openid)) {
      return res.redirect('/join.html?auth=done');
    }

    const user = {
      id: 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      nickname: decodeURIComponent(userInfo.nickname.replace(/\\u/g, '%u')),
      phone: '',
      avatar: userInfo.headimgurl || '',
      openid: userInfo.openid,
      joinTime: new Date().toISOString(),
    };
    participants.push(user);
    saveData(data);
    res.redirect('/join.html?auth=success');
  } catch (e) {
    res.redirect('/join.html?auth=fail');
  }
});

// ===== API: 用户参与 =====
app.post('/api/join', (req, res) => {
  const { nickname, phone, openid } = req.body;
  const data = loadData();
  const participants = data.participants;

  // 微信授权参与（不需要手机号）
  if (openid) {
    if (participants.some(p => p.openid === openid)) {
      return res.json({ success: false, message: '您已经参与过了' });
    }
    const user = {
      id: 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      nickname: nickname || '微信用户',
      phone: '',
      avatar: req.body.avatar || '',
      openid,
      joinTime: new Date().toISOString(),
    };
    participants.push(user);
    saveData(data);
    return res.json({ success: true, message: '参与成功！', user: { id: user.id, nickname: user.nickname } });
  }

  // 传统方式（手机号）
  if (!nickname || !phone) {
    return res.json({ success: false, message: '请填写姓名和手机号' });
  }
  if (!/^1\d{10}$/.test(phone)) {
    return res.json({ success: false, message: '手机号格式不正确' });
  }
  if (participants.some(p => p.phone === phone)) {
    return res.json({ success: false, message: '您已经参与过了' });
  }
  const user = {
    id: 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    nickname: nickname.trim(),
    phone,
    avatar: '',
    openid: '',
    joinTime: new Date().toISOString(),
  };
  participants.push(user);
  saveData(data);
  res.json({ success: true, message: '参与成功！', user: { id: user.id, nickname: user.nickname } });
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
  const { prizeName, count: reqCount } = req.body;
  const data = loadData();
  const prize = data.prizes.find(p => p.name === prizeName);
  if (!prize) return res.json({ success: false, message: '奖项不存在' });

  const remaining = prize.count - prize.winners.length;
  if (remaining <= 0) return res.json({ success: false, message: '该奖项已抽完' });

  const allWinners = new Set();
  data.prizes.forEach(p => p.winners.forEach(w => allWinners.add(w.id)));
  const available = data.participants.filter(p => !allWinners.has(p.id));
  if (available.length === 0) return res.json({ success: false, message: '没有可抽奖的参与者' });

  const drawCount = reqCount ? Math.min(reqCount, remaining, available.length) : 1;

  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, drawCount);

  winners.forEach(w => {
    prize.winners.push({ id: w.id, nickname: w.nickname, phone: w.phone, avatar: w.avatar || '' });
  });
  data.drawLog.push({
    prize: prizeName,
    winners: winners.map(w => ({ id: w.id, nickname: w.nickname })),
    time: new Date().toISOString(),
  });
  saveData(data);

  res.json({ success: true, winners: winners.map(w => ({ id: w.id, nickname: w.nickname, avatar: w.avatar })) });
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

// ===== API: 重置全部（含参与者）=====
app.post('/api/reset-all', (req, res) => {
  const data = loadData();
  data.participants = [];
  data.prizes.forEach(p => p.winners = []);
  data.drawLog = [];
  saveData(data);
  res.json({ success: true, message: '已全部重置' });
});

// ===== 获取当前公网URL =====
function getPublicUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  const host = req.get('host');
  const forwardedHost = req.get('x-forwarded-host');
  const useHost = forwardedHost || host;
  if (useHost && !useHost.includes('localhost') && !useHost.includes('127.0.0.1') && !useHost.includes('192.168')) {
    return `https://${useHost}`;
  }
  const proto = req.get('x-forwarded-proto') || 'http';
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return `${proto}://${host}`;
  }
  return BASE_URL;
}

// ===== API: 微信二维码（生成小程序码）=====
app.get('/api/wechat/qrcode', async (req, res) => {
  try {
    const data = loadData();
    const { wechatAppId, qrImage } = data.settings || {};
    // 如果有自定义二维码图片，优先返回
    if (qrImage) {
      return res.json({ success: true, qrcode: qrImage, url: '', appId: wechatAppId || '', isCustom: true });
    }
    const url = `${getPublicUrl(req)}/join.html?wechat=1`;
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
    res.json({ success: true, qrcode: qr, url, appId: wechatAppId || '' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ===== API: 二维码 =====
app.get('/api/qrcode', async (req, res) => {
  try {
    const data = loadData();
    const { qrImage } = data.settings || {};
    // 如果有自定义二维码图片，优先返回
    if (qrImage) {
      return res.json({ success: true, qrcode: qrImage, url: '', isCustom: true });
    }
    const url = `${getPublicUrl(req)}/join.html`;
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
    res.json({ success: true, qrcode: qr, url });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ===== API: 直接返回二维码图片 =====
app.get('/api/qrcode.png', async (req, res) => {
  try {
    const url = `${getPublicUrl(req)}/join.html`;
    const buf = await QRCode.toBuffer(url, { width: 400, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
    res.type('png').send(buf);
  } catch (e) {
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
      settings: data.settings || {},
    }
  });
});

// ===== API: 参与者详细数据（含微信头像）=====
app.get('/api/participants/detail', (req, res) => {
  const data = loadData();
  const allWinners = new Set();
  data.prizes.forEach(p => p.winners.forEach(w => allWinners.add(w.id)));
  res.json({
    success: true,
    data: data.participants.map(p => ({
      ...p,
      isWinner: allWinners.has(p.id),
    })),
    total: data.participants.length,
  });
});

// ===== 启动 =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║         年会抽奖系统 v3.0                ║
  ╠══════════════════════════════════════════╣
  ║  公网: ${BASE_URL}${BASE_URL.length < 35 ? ' '.repeat(35 - BASE_URL.length) : ''}║
  ║  大屏: ${BASE_URL}/${BASE_URL.length < 31 ? ' '.repeat(31 - BASE_URL.length) : ''}║
  ║  管理: ${BASE_URL}/admin.html${BASE_URL.length < 27 ? ' '.repeat(27 - BASE_URL.length) : ''}║
  ╠══════════════════════════════════════════╣
  ║  部署到公网时自动可用, 局域网也可用       ║
  ╚══════════════════════════════════════════╝
  `);
});
