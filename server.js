'use strict';
/*
 * 秋招信息后端（零依赖 Node.js）
 * - 静态托管当前目录（index.html / styles.css / app.js …）
 * - 每日定时抓取 2027 届秋招信息（方案1：每日预拉取）
 * - 提供 REST API 给前端工作台读取 / 新增 / 标记 / 删除
 *
 * 启动：        node server.js
 * 立即抓取一次：  node server.js fetch
 * 浏览器访问：    http://localhost:8080   （手机用同局域网电脑的 IP）
 *
 * 配置见同目录 config.json（首次运行会自动生成默认配置）。
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'recruit.json');
const CONFIG_FILE = path.join(ROOT, 'config.json');

const DEFAULT_CONFIG = {
  port: 8080,
  query: '2027 秋招 校招 网申 截止 投递',
  bingKey: '',                                  // Azure Bing Web Search API 密钥
  bingEndpoint: 'https://api.bing.microsoft.com/v7.0/search',
  rssFeeds: [],                                 // 公众号 / 招聘站 RSS 桥接地址
  cityFilter: [],                               // 只保留这些城市，留空=不限
  fetchOnStart: true,
  fetchHour: 8                                  // 每日自动抓取时刻（24h 制）
};

let lastFetchAt = null;

/* ---------------- 配置 ---------------- */
function loadConfig(){
  let cfg = Object.assign({}, DEFAULT_CONFIG);
  try{
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const user = JSON.parse(raw);
    cfg = Object.assign(cfg, user);
  }catch(e){ /* 无配置文件则用默认并稍后写入 */ }
  return cfg;
}
function ensureConfig(cfg){
  if(!fs.existsSync(CONFIG_FILE)){
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  }
}

/* ---------------- 工具：HTTP GET（跟随重定向） ---------------- */
function httpGet(targetUrl, headers, redirects){
  headers = headers || {};
  redirects = redirects == null ? 3 : redirects;
  return new Promise((resolve, reject)=>{
    let u;
    try{ u = new URL(targetUrl); }catch(e){ return reject(new Error('bad url: '+targetUrl)); }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(targetUrl, {
      headers: Object.assign({ 'User-Agent': 'Mozilla/5.0 (WorkBuddyRecruitBot)' }, headers)
    }, res=>{
      const { statusCode, headers: h } = res;
      if(statusCode >= 300 && statusCode < 400 && h.location && redirects > 0){
        const next = new URL(h.location, targetUrl).toString();
        res.resume();
        return resolve(httpGet(next, headers, redirects - 1));
      }
      if(statusCode !== 200){ res.resume(); return reject(new Error('HTTP ' + statusCode + ' for ' + targetUrl)); }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c=> data += c);
      res.on('end', ()=> resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, ()=> req.destroy(new Error('timeout: ' + targetUrl)));
  });
}

/* ---------------- 文本解析 ---------------- */
function decodeEntities(s){
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n)=> String.fromCharCode(+n));
}
function stripTags(s){
  return decodeEntities(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function pick(block, tag){
  const m = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return m ? m[1] : '';
}
function validDate(y, m, d){
  if(m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if(dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}
function pad(n){ return String(n).padStart(2, '0'); }
function toISO(dt){ return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }

function extractDeadline(text){
  if(!text) return '';
  // 2026-10-31 / 2026.10.31 / 2026/10/31 / 2026年10月31日
  let m = text.match(/(20\d{2})[-./年](\d{1,2})[-./月](\d{1,2})[日号]?/);
  if(m){
    const dt = validDate(+m[1], +m[2], +m[3]);
    if(dt) return toISO(dt);
  }
  // 10月31日 或 10.31（默认 2026 年，覆盖秋招主周期）
  m = text.match(/(\d{1,2})[月.\-/](\d{1,2})[日号]?/);
  if(m){
    const dt = validDate(2026, +m[1], +m[2]);
    if(dt) return toISO(dt);
  }
  return '';
}
const CITIES = ['北京','上海','广州','深圳','杭州','成都','南京','武汉','西安','苏州','重庆','天津','长沙','青岛','厦门','合肥','郑州','无锡','宁波','佛山','东莞','珠海','济南','福州','昆明','大连','哈尔滨','沈阳','石家庄','南昌','南宁','贵阳','太原','长春','兰州','海口','常州','嘉兴'];
function extractCity(text){
  if(!text) return '';
  return CITIES.find(c=> text.indexOf(c) !== -1) || '';
}
function extractCompany(title, linkUrl){
  if(!title) return '';
  const parts = title.split(/[｜|︱—–\-:：]/);
  if(parts.length > 1){
    const cand = parts[0].trim();
    if(cand.length >= 2 && cand.length <= 20) return cand;
  }
  try{
    const host = new URL(linkUrl).hostname.replace(/^www\./, '');
    const seg = host.split('.');
    return seg.length > 2 ? seg[seg.length - 3] : host;
  }catch(e){ return ''; }
}
function uid(){
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------------- 抓取源 ---------------- */
async function fetchBing(cfg){
  if(!cfg.bingKey) return [];
  const q = encodeURIComponent(cfg.query);
  const ep = cfg.bingEndpoint + '?q=' + q + '&mkt=zh-CN&count=50';
  try{
    const body = await httpGet(ep, { 'Ocp-Apim-Subscription-Key': cfg.bingKey });
    const json = JSON.parse(body);
    const vals = (json.webPages && json.webPages.value) || [];
    return vals.map(v=>({
      title: v.name || '',
      url: v.url || '',
      summary: v.snippet || '',
      publishedAt: v.dateLastCrawled || new Date().toISOString(),
      source: 'bing',
      sourceName: 'Bing 搜索'
    }));
  }catch(e){ console.error('[bing] 抓取失败：', e.message); return []; }
}

async function fetchRss(feedUrl, name){
  try{
    const xml = await httpGet(feedUrl);
    const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
    const out = items.map(it=>{
      const title = stripTags(pick(it, 'title'));
      let link = stripTags(pick(it, 'link'));
      if(!link){
        const am = it.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
        if(am) link = decodeEntities(am[1].trim());
      }
      const desc = stripTags(pick(it, 'description'));
      const pub = stripTags(pick(it, 'pubDate'));
      return {
        title, url: link, summary: desc,
        publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
        source: 'rss', sourceName: name || 'RSS'
      };
    }).filter(x=> x.title);
    return out;
  }catch(e){ console.error('[rss] ' + feedUrl + ' 失败：', e.message); return []; }
}

/* ---------------- 合并 / 入库 ---------------- */
function normalize(raw){
  return raw.map(it=>{
    const text = (it.title || '') + ' ' + (it.summary || '');
    return {
      id: uid(),
      title: it.title || '(无标题)',
      company: it.company || extractCompany(it.title, it.url),
      url: it.url || '',
      city: it.city || extractCity(text),
      deadline: it.deadline || extractDeadline(text),
      summary: it.summary || '',
      source: it.source || 'manual',
      sourceName: it.sourceName || '手动添加',
      publishedAt: it.publishedAt || new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      tags: it.tags || ['2027', '秋招'],
      interest: false,
      applied: false
    };
  });
}
function loadItems(){
  try{ return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }catch(e){ return []; }
}
function saveItems(items){
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
}
async function fetchAll(cfg){
  let raw = [];
  raw = raw.concat(await fetchBing(cfg));
  for(const feed of (cfg.rssFeeds || [])){
    const name = (typeof feed === 'object' && feed.name) || '';
    const u = (typeof feed === 'object' && feed.url) || (typeof feed === 'string' ? feed : '');
    if(u) raw = raw.concat(await fetchRss(u, name));
  }
  let incoming = normalize(raw);
  if(cfg.cityFilter && cfg.cityFilter.length){
    incoming = incoming.filter(x=> !x.city || cfg.cityFilter.indexOf(x.city) !== -1);
  }
  const existing = loadItems();
  const byUrl = new Set(existing.filter(x=> x.url).map(x=> x.url));
  let added = 0;
  incoming.forEach(x=>{
    const key = x.url || ('__title__' + x.title);
    if(!byUrl.has(key)){
      if(x.url) byUrl.add(x.url);
      existing.push(x);
      added++;
    }
  });
  saveItems(existing);
  lastFetchAt = new Date().toISOString();
  console.log(`[fetch] 新增 ${added} 条，总计 ${existing.length} 条`);
  return { added, total: existing.length };
}

/* ---------------- 静态托管 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};
function serveStatic(req, res){
  let pathname = decodeURIComponent(url.parse(req.url).pathname);
  if(pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(ROOT, pathname));
  if(filePath.indexOf(ROOT) !== 0){ res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data)=>{
    if(err){ res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------------- API ---------------- */
function sendJSON(res, code, obj){
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(obj));
}
function readBody(req){
  return new Promise((resolve, reject)=>{
    let body = '';
    req.on('data', c=> body += c);
    req.on('end', ()=>{
      try{ resolve(body ? JSON.parse(body) : {}); }catch(e){ reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}
function handleApi(req, res){
  const parts = url.parse(req.url).pathname.split('/').filter(Boolean); // ['api','recruit', id?]
  if(parts[1] !== 'recruit'){ return sendJSON(res, 404, { error: 'not found' }); }
  const id = parts[2];
  const cfg = loadConfig();

  if(req.method === 'GET' && !id){
    const items = loadItems().slice().sort((a, b)=> (a.deadline || '9999').localeCompare(b.deadline || '9999'));
    return sendJSON(res, 200, { items, updatedAt: lastFetchAt, count: items.length });
  }
  if(req.method === 'POST' && !id){
    return readBody(req).then(d=>{
      const item = {
        id: uid(),
        title: d.title || '(无标题)',
        company: d.company || '',
        url: d.url || '',
        city: d.city || '',
        deadline: d.deadline || '',
        summary: d.summary || '',
        source: 'manual',
        sourceName: d.sourceName || '手动添加',
        publishedAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        tags: d.tags || ['2027', '秋招'],
        interest: false,
        applied: false
      };
      const items = loadItems();
      items.push(item);
      saveItems(items);
      sendJSON(res, 201, item);
    }).catch(()=> sendJSON(res, 400, { error: 'bad json' }));
  }
  if(req.method === 'PATCH' && id){
    return readBody(req).then(d=>{
      const items = loadItems();
      const idx = items.findIndex(x=> x.id === id);
      if(idx < 0) return sendJSON(res, 404, { error: 'not found' });
      Object.assign(items[idx], d);
      saveItems(items);
      sendJSON(res, 200, items[idx]);
    }).catch(()=> sendJSON(res, 400, { error: 'bad json' }));
  }
  if(req.method === 'DELETE' && id){
    let items = loadItems();
    const before = items.length;
    items = items.filter(x=> x.id !== id);
    saveItems(items);
    return sendJSON(res, 200, { ok: true, removed: before - items.length });
  }
  if(req.method === 'POST' && id === 'fetch'){
    return fetchAll(cfg).then(r=> sendJSON(res, 200, r)).catch(e=> sendJSON(res, 500, { error: e.message }));
  }
  sendJSON(res, 405, { error: 'method not allowed' });
}

/* ---------------- 每日调度 ---------------- */
function scheduleDaily(hour){
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour || 8, 0, 0, 0);
  if(next <= now) next.setDate(next.getDate() + 1);
  const ms = next - now;
  setTimeout(()=>{
    fetchAll(loadConfig()).catch(e=> console.error(e));
    setInterval(()=> fetchAll(loadConfig()).catch(e=> console.error(e)), 24 * 60 * 60 * 1000);
  }, ms);
  console.log(`[schedule] 每日 ${hour || 8}:00 自动抓取，下次执行：${next.toLocaleString()}`);
}

/* ---------------- 启动 ---------------- */
(async ()=>{
  const cfg = loadConfig();
  ensureConfig(cfg);

  if(process.argv[2] === 'fetch'){
    const r = await fetchAll(cfg);
    console.log('抓取完成：', r);
    process.exit(0);
  }

  if(cfg.fetchOnStart){
    fetchAll(cfg).catch(e=> console.error(e));
  }
  scheduleDaily(cfg.fetchHour);
  scheduleDaily._started = true;

  const server = http.createServer((req, res)=>{
    if(url.parse(req.url).pathname.indexOf('/api/') === 0) return handleApi(req, res);
    return serveStatic(req, res);
  });
  server.listen(cfg.port, ()=>{
    console.log('秋招后端已启动： http://localhost:' + cfg.port);
    console.log('说明：Bing 抓取需要 config.json 的 bingKey；公众号请用 RSS 桥接填入 rssFeeds。');
  });
})();
