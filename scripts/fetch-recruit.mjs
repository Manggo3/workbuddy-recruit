// scripts/fetch-recruit.mjs
// 秋招信息云端抓取脚本（零依赖，仅用 Node 内置模块）
// 设计用途：GitHub Actions 定时执行，把抓取结果写入仓库根的 recruit.json，
//          前端通过 jsDelivr / raw 直接读取，实现「电脑关机也能每天自动跑」。
// 产出格式：{ items: [...], updatedAt: ISOString, count: N }
//
// 本地手动跑一次：  node scripts/fetch-recruit.mjs
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'recruit.json');
const CONFIG_FILE = path.join(ROOT, 'config.json');

const DEFAULT_CONFIG = {
  query: '2027 秋招 校招 网申 截止 投递',
  bingKey: '',                                  // Azure Bing Web Search API 密钥（留空则跳过 Bing）
  bingEndpoint: 'https://api.bing.microsoft.com/v7.0/search',
  rssFeeds: [],                                 // 公众号 / 招聘站 RSS 桥接地址（字符串或 {name,url}）
  cityFilter: []                                // 只保留这些城市，留空 = 不限
};

function loadConfig(){
  let cfg = Object.assign({}, DEFAULT_CONFIG);
  try{
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    cfg = Object.assign(cfg, JSON.parse(raw));
  }catch(e){ /* 用默认配置 */ }
  // 密钥从环境变量注入（GitHub Actions 里用 Secrets），不要写进 config.json 提交到公开仓库
  if(process.env.RECRUIT_BING_KEY) cfg.bingKey = process.env.RECRUIT_BING_KEY;
  return cfg;
}

function httpGet(targetUrl, headers, redirects){
  headers = headers || {};
  redirects = redirects == null ? 3 : redirects;
  return new Promise((resolve, reject)=>{
    let u; try{ u = new URL(targetUrl); }catch(e){ return reject(new Error('bad url')); }
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
      if(statusCode !== 200){ res.resume(); return reject(new Error('HTTP ' + statusCode)); }
      let data = ''; res.setEncoding('utf8');
      res.on('data', c=> data += c);
      res.on('end', ()=> resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, ()=> req.destroy(new Error('timeout')));
  });
}

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
  let m = text.match(/(20\d{2})[-./年](\d{1,2})[-./月](\d{1,2})[日号]?/);
  if(m){ const dt = validDate(+m[1], +m[2], +m[3]); if(dt) return toISO(dt); }
  m = text.match(/(\d{1,2})[月.\-/](\d{1,2})[日号]?/);
  if(m){ const dt = validDate(2026, +m[1], +m[2]); if(dt) return toISO(dt); }
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
function uid(){ return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

async function fetchBing(cfg){
  if(!cfg.bingKey) return [];
  const q = encodeURIComponent(cfg.query);
  const ep = cfg.bingEndpoint + '?q=' + q + '&mkt=zh-CN&count=50';
  try{
    const body = await httpGet(ep, { 'Ocp-Apim-Subscription-Key': cfg.bingKey });
    const json = JSON.parse(body);
    return ((json.webPages || {}).value || []).map(v=>({
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
    return items.map(it=>{
      const title = stripTags(pick(it, 'title'));
      let link = stripTags(pick(it, 'link'));
      if(!link){
        const am = it.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
        if(am) link = decodeEntities(am[1].trim());
      }
      const pub = stripTags(pick(it, 'pubDate'));
      return {
        title, url: link, summary: stripTags(pick(it, 'description')),
        publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
        source: 'rss', sourceName: name || 'RSS'
      };
    }).filter(x=> x.title);
  }catch(e){ console.error('[rss] ' + feedUrl + ' 失败：', e.message); return []; }
}

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
  try{
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(d) ? d : (d.items || []);
  }catch(e){ return []; }
}
function saveItems(items){
  fs.writeFileSync(DATA_FILE, JSON.stringify({ items, updatedAt: new Date().toISOString(), count: items.length }, null, 2), 'utf8');
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
  console.log(`[fetch] 新增 ${added} 条，总计 ${existing.length} 条`);
  return { added, total: existing.length };
}

(async ()=>{
  const cfg = loadConfig();
  const r = await fetchAll(cfg);
  console.log('抓取完成：', r);
})().catch(e=>{ console.error('抓取异常：', e); process.exit(1); });
