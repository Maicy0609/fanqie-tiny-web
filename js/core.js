/** @typedef {{id:string,name:string,author:string,cover:string,abstract:string,score:string,tags:string[],readText:string,category:string,words:number,chapters:number,status:number,color:string,raw:any}} Book */
/** @typedef {{id:string,vid:string,title:string,cover:string,episodes:number,duration:number,playText:string,intro:string,color:string,raw:any}} Series */
/** @typedef {{id:string,text:string,user:string,avatar:string,time:number,digg:number,replies:number,liked:boolean,replyTo:string}} Comment */
/** @typedef {{name:string,params:Record<string,string>,query:URLSearchParams}} CtxBase */
/** @typedef {{params:Record<string,string>,query:URLSearchParams,signal:AbortSignal,title:(t:string)=>void}} ViewCtx */

const LS = 'fq.';
const DEFAULT_CONFIG = { base: '', token: '', theme: 'auto', accent: 'tomato', scale: 1, line: 1.9, paper: 'paper' };

/** @type {{base:string,token:string,theme:string,accent:string,scale:number,line:number,paper:string}} */
export const cfg = loadConfig();

/** @param {string} key @param {any} fallback */
export function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(LS + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (_) { return fallback; }
}

/** @param {string} key @param {any} value */
export function writeStore(key, value) {
  try { localStorage.setItem(LS + key, JSON.stringify(value)); return true; }
  catch (_) { return false; }
}

/** @param {string} key */
export function dropStore(key) { try { localStorage.removeItem(LS + key); } catch (_) { /* ignore */ } }

function loadConfig() {
  const saved = readStore('config', {});
  return Object.assign({}, DEFAULT_CONFIG, saved && typeof saved === 'object' ? saved : {});
}

/** @param {Partial<typeof DEFAULT_CONFIG>} patch */
export function saveConfig(patch) {
  Object.assign(cfg, patch);
  writeStore('config', cfg);
  applyTheme();
}

/* ---------- DOM ---------- */

/** @template {HTMLElement} T @param {string} id @returns {T} */
export function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error('missing element #' + id);
  return /** @type {any} */ (node);
}

/**
 * @param {string} tag
 * @param {Record<string, any>|null} [props]
 * @param {...any} kids
 * @returns {any}
 */
export function h(tag, props, ...kids) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'style' && typeof value === 'object') {
        for (const [prop, val] of Object.entries(value)) {
          if (prop.startsWith('--')) node.style.setProperty(prop, String(val));
          else /** @type {any} */ (node.style)[prop] = String(val);
        }
      }
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key in node) /** @type {any} */ (node)[key] = value;
      else node.setAttribute(key, String(value));
    }
  }
  append(node, kids);
  return node;
}

/** @param {any} node @param {any[]} kids */
function append(node, kids) {
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    if (Array.isArray(kid)) append(node, kid);
    else if (kid instanceof Node) node.append(kid);
    else node.append(document.createTextNode(String(kid)));
  }
}

/** @param {Element} node */
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

/** @param {string} q @param {Element|Document} [root] @returns {any} */
export const qs = (q, root = document) => root.querySelector(q);
/** @param {string} q @param {Element|Document} [root] @returns {any[]} */
export const qsa = (q, root = document) => Array.from(root.querySelectorAll(q));

/** @param {unknown} err @returns {string} */
export function msg(err) {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : '未知错误';
}

/* ---------- format ---------- */

/** @param {any} value */
export function num(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (n >= 100000000) return (n / 100000000).toFixed(n >= 1000000000 ? 0 : 1).replace(/\.0$/, '') + '亿';
  if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + '万';
  return String(n);
}

/** @param {any} value */
export function words(value) {
  const n = Number(value);
  if (!n) return '';
  return n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + ' 万字' : n + ' 字';
}

/** @param {any} value seconds */
export function dur(value) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return (h ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

/** @param {any} value unix seconds */
export function when(value) {
  const ts = Number(value);
  if (!ts) return '';
  const date = new Date(ts < 1e12 ? ts * 1000 : ts);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' 天前';
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

/** @param {string} value */
export function clock(value) {
  const s = Number(value) || 0;
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

/** @param {string} text @param {number} [max] */
export function trim(text, max = 120) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? value.slice(0, max) + '…' : value;
}

/** @param {string} value @param {string} [fallback] */
export function safeColor(value, fallback = '#E0402F') {
  return /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? String(value) : fallback;
}

/* ---------- api ---------- */

export class ApiError extends Error {
  /** @param {number} status @param {number|string} code @param {string} message @param {any} [payload] */
  constructor(status, code, message, payload) {
    super(message || '请求失败');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

/**
 * @param {string} path
 * @param {Record<string, any>} [params]
 * @param {{signal?:AbortSignal, timeout?:number, method?:string, body?:any}} [opts]
 * @returns {Promise<any>}
 */
export async function api(path, params = {}, opts = {}) {
  if (!cfg.token) throw new ApiError(401, 'NO_TOKEN', '还没有设置访问令牌');
  const base = cfg.base ? cfg.base.replace(/\/+$/, '') : '';
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    query.set(key, String(value));
  }
  const url = (base || '') + path + (query.toString() ? '?' + query.toString() : '');
  const timeout = opts.timeout ?? 60000;
  const timer = new AbortController();
  const timerId = setTimeout(() => timer.abort(new DOMException('timeout', 'TimeoutError')), timeout);
  /** @type {AbortSignal[]} */
  const signals = [timer.signal];
  if (opts.signal) signals.push(opts.signal);

  const method = (opts.method || 'GET').toUpperCase();
  /** @type {Record<string,string>} */
  const headers = { Authorization: 'Bearer ' + cfg.token, Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';

  let response;
  try {
    response = await fetch(url, {
      method,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: signals.length > 1 && 'any' in AbortSignal ? AbortSignal.any(signals) : timer.signal,
      headers,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ApiError(0, 'TIMEOUT', '请求超时，服务器可能正在加载');
    }
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', '无法连接服务器');
  } finally {
    clearTimeout(timerId);
  }

  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_) { payload = null; }

  if (!response.ok) {
    const message = payload && (payload.error || payload.message) ? String(payload.error || payload.message) : 'HTTP ' + response.status;
    throw new ApiError(response.status, payload && payload.code !== undefined ? payload.code : response.status, message, payload);
  }
  if (payload && typeof payload.code === 'number' && payload.code !== 0) {
    throw new ApiError(200, payload.code, String(payload.message || '接口返回错误'), payload);
  }
  return payload;
}

/**
 * POST routes on this server read their parameters from the query string.
 * @param {string} path
 * @param {Record<string, any>} [params]
 * @param {any} [body]
 * @param {{signal?:AbortSignal, timeout?:number}} [opts]
 */
export function apiPost(path, params = {}, body = undefined, opts = {}) {
  return api(path, params, Object.assign({}, opts, { method: 'POST', body }));
}

/** @param {string} path @returns {string} */
export function mediaUrl(path) {
  if (!path) return '';
  let value = String(path);
  if (/^https?:\/\//i.test(value)) return value.replace(/^http:\/\//i, 'https://');
  if (!value.startsWith('/src/')) return value;
  const base = cfg.base ? cfg.base.replace(/\/+$/, '') : '';
  return base + value + (value.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(cfg.token);
}

/**
 * @param {{signal?:AbortSignal}} [opts]
 * @returns {Promise<{health:any,ready:any,devices:number}>}
 */
export async function health(opts = {}) {
  const base = cfg.base ? cfg.base.replace(/\/+$/, '') : '';
  const get = async (/** @type {string} */ path) => {
    try {
      const res = await fetch(base + path, { signal: opts.signal || AbortSignal.timeout(5000) });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      return { status: 0, data: null };
    }
  };
  const [h, r] = await Promise.all([get('/healthz'), get('/readyz')]);
  return {
    health: h.data,
    ready: r.data,
    devices: r.data && typeof r.data.devices === 'number' ? r.data.devices : 0,
  };
}

/* ---------- adapters ---------- */

/** @param {any} raw @returns {Book} */
export function bookOf(raw) {
  const b = raw && Array.isArray(raw.book_data) ? raw.book_data[0] || {} : raw || {};
  /** @param {...string} keys */
  const pick = (...keys) => { for (const key of keys) if (b[key] !== undefined && b[key] !== null && b[key] !== '') return b[key]; return ''; };
  return {
    id: String(pick('book_id', 'id', 'bookId')),
    name: String(pick('book_name', 'name', 'raw_book_name')),
    author: String(pick('author', 'author_name')),
    cover: String(pick('thumb_url', 'expand_thumb_url', 'detail_page_thumb_url', 'horiz_thumb_url', 'audio_thumb_url_hd', 'coverUrl')),
    abstract: String(pick('abstract', 'book_abstract_v2', 'intro')),
    score: String(pick('score')),
    tags: String(pick('tags', 'pure_category_tags')).split(',').map((s) => s.trim()).filter(Boolean),
    readText: String(pick('read_cnt_text', 'sub_info', 'read_count_text')),
    category: String(pick('category')),
    words: Number(pick('word_number', 'wordCount')) || 0,
    chapters: Number(pick('chapter_number', 'chapterTotalNum', 'serial_count')) || 0,
    status: Number(pick('creation_status', 'status')) || 0,
    color: safeColor(String(pick('color_dominate', 'back_color_dominate'))),
    raw: b,
  };
}

/** @param {any} raw @returns {Series} */
export function seriesOf(raw) {
  const base = (raw && raw.video_data) || raw || {};
  const first = Array.isArray(base.video_list) && base.video_list[0] ? base.video_list[0] : {};
  /** @param {...string} keys */
  const pick = (...keys) => {
    for (const key of keys) if (base[key] !== undefined && base[key] !== null && base[key] !== '') return base[key];
    return '';
  };
  const title = String(pick('series_title', 'title', 'book_name') || first.title || '');
  return {
    id: String(pick('series_id', 'book_id', 'id') || first.series_id || ''),
    vid: String(first.vid || pick('vid', 'video_id')),
    title,
    cover: String(pick('series_cover', 'cover', 'horiz_cover') || first.cover || ''),
    episodes: Number(pick('episode_cnt') || first.episode_cnt || 0),
    duration: Number(pick('duration') || first.duration || 0),
    playText: pick('series_play_cnt', 'play_cnt') ? num(pick('series_play_cnt', 'play_cnt')) + ' 次播放' : '',
    intro: String(pick('series_intro', 'abstract', 'sub_title') || ''),
    color: safeColor(String(pick('series_color_hex', 'color_dominate') || first.color_dominate || '')),
    raw: base,
  };
}

/** @param {any} raw @returns {Comment} */
export function commentOf(raw) {
  const c = raw && raw.comment ? raw.comment : raw || {};
  const common = c.common || {};
  const content = common.content || {};
  const user = common.user_info || {};
  const base = user.base_info || {};
  const stat = c.stat || raw.stat || {};
  const action = c.user_action || raw.user_action || {};
  const text = content.text || raw.content || '';
  return {
    id: String(c.comment_id || raw.comment_id || ''),
    text: String(text),
    user: String(base.user_name || user.user_name || raw.user_name || '书友'),
    avatar: String(base.user_avatar || user.avatar || ''),
    time: Number(common.create_timestamp || raw.create_timestamp || 0),
    digg: Number(stat.digg_count ?? raw.digg_count ?? 0),
    replies: Number(stat.reply_count ?? raw.reply_count ?? 0),
    liked: Boolean(action.user_digg || raw.user_digg),
    replyTo: String(raw.reply_to_user_name || ''),
  };
}

/** @param {string} xhtml @returns {{idx:number,text:string}[]} */
export function paragraphsOf(xhtml) {
  if (!xhtml) return [];
  const doc = new DOMParser().parseFromString(String(xhtml), 'text/html');
  const nodes = Array.from(doc.querySelectorAll('p'));
  const list = nodes
    .map((p, i) => ({ idx: Number(p.getAttribute('idx') ?? i), text: (p.textContent || '').replace(/\s+/g, ' ').trim() }))
    .filter((p) => p.text);
  if (list.length) return list;
  return String(xhtml).split(/\n+/).map((s, i) => ({ idx: i, text: s.trim() })).filter((p) => p.text);
}

/* ---------- components ---------- */

/** @param {string} src @param {string} alt @param {string} [cls] */
export function image(src, alt, cls = '') {
  const img = h('img', { alt, class: cls, loading: 'lazy', decoding: 'async' });
  const value = mediaUrl(src);
  if (!value) { img.hidden = true; return img; }
  if (/^(https?:\/\/|\/)/i.test(value)) img.src = value;
  img.addEventListener('error', () => { img.style.opacity = '0'; }, { once: true });
  return img;
}

/** @param {Book} book @param {{progress?:string}} [opts] */
export function bookCard(book, opts = {}) {
  const cover = h('div', { class: 'cover' },
    image(book.cover, book.name),
    h('div', { class: 'cover-fallback' }, h('span', null, book.name)),
    book.raw && book.raw.exclusive === '1' ? h('span', { class: 'corner' }, '独家') : null,
    opts.progress ? h('span', { class: 'progress-chip' }, opts.progress) : null,
  );
  return h('a', { class: 'book-card', href: '#/book/' + book.id },
    cover,
    h('div', { class: 'meta' },
      h('strong', { title: book.name }, book.name),
      h('small', null, book.author || book.category || ''),
    ),
  );
}

/** @param {Series} series */
export function seriesCard(series) {
  return h('a', { class: 'series-card', href: '#/series/' + series.id },
    h('div', { class: 'shot' },
      image(series.cover, series.title),
      h('span', { class: 'count' }, series.episodes ? series.episodes + ' 集' : '短剧'),
      h('span', { class: 'play' }, h('i', null, 'play_arrow')),
    ),
    h('strong', null, series.title),
    h('small', null, [series.playText, series.intro ? trim(series.intro, 24) : ''].filter(Boolean).join(' · ')),
  );
}

/** @param {string} title @param {any[]} items @param {string} [more] */
export function shelf(title, items, more = '') {
  if (!items.length) return null;
  return h('section', { class: 'shelf' },
    h('div', { class: 'section-head' },
      h('h2', null, title),
      more ? h('a', { class: 'more', href: more }, '全部', h('i', null, 'chevron_right')) : null,
    ),
    h('div', { class: 'shelf-row' }, items),
  );
}

/** @param {Comment} c @param {{onDigg?:(c:Comment)=>void,onReply?:(c:Comment)=>void,onReplies?:(c:Comment)=>void,compact?:boolean}} [opts] */
export function commentView(c, opts = {}) {
  const avatar = h('div', { class: 'avatar' }, c.avatar ? image(c.avatar, c.user) : h('i', null, 'person'));
  return h('div', { class: 'comment' },
    avatar,
    h('div', { class: 'comment-body' },
      h('div', { class: 'comment-head' },
        h('strong', null, c.user),
        c.replyTo ? h('span', null, '回复 ' + c.replyTo) : null,
        h('span', null, when(c.time)),
      ),
      h('div', { class: 'comment-text' }, c.text),
      h('div', { class: 'comment-foot' },
        h('button', { type: 'button', class: c.liked ? 'liked' : '', onclick: () => opts.onDigg && opts.onDigg(c) },
          h('i', null, 'thumb_up'), c.digg ? num(c.digg) : '赞'),
        c.replies && opts.onReplies
          ? h('button', { type: 'button', onclick: () => opts.onReplies && opts.onReplies(c) }, h('i', null, 'forum'), '查看 ' + num(c.replies) + ' 条回复')
          : (opts.onReply || c.replies ? h('button', { type: 'button', onclick: () => opts.onReply && opts.onReply(c) },
            h('i', null, 'chat_bubble'), c.replies ? num(c.replies) : '回复') : null),
        c.id ? h('button', { type: 'button', title: '复制评论 id', onclick: () => copy(c.id) }, h('i', null, 'content_copy')) : null,
      ),
    ),
  );
}

/** @param {any[]} rawList @param {any} [opts] */
export function commentList(rawList, opts = {}) {
  const list = h('div', { class: 'comment-list' });
  for (const raw of rawList || []) list.append(commentView(commentOf(raw), opts));
  return list;
}

/** @param {{icon?:string,title:string,text?:string,action?:Node}} spec */
export function emptyState(spec) {
  return h('div', { class: 'state' },
    h('div', { class: 'state-shape' }, h('i', null, spec.icon || 'auto_stories')),
    h('h2', null, spec.title),
    spec.text ? h('p', null, spec.text) : null,
    spec.action || null,
  );
}

/** @param {any} err @param {()=>void} [retry] */
export function errorState(err, retry) {
  const msg = err && err.message ? err.message : '未知错误';
  const code = err && err.code && err.code !== 'NETWORK' ? String(err.code) : '';
  return h('div', { class: 'state' },
    h('div', { class: 'state-shape' }, h('i', null, err && err.status === 401 ? 'key_off' : 'cloud_off')),
    h('h2', null, err && err.status === 401 ? '需要访问令牌' : '加载失败'),
    h('p', null, msg),
    code ? h('div', { class: 'code' }, 'code ' + code) : null,
    retry ? h('button', { class: 'act tonal', type: 'button', onclick: retry }, h('i', null, 'refresh'), '重试') : null,
    err && err.status === 401 ? h('a', { class: 'act primary', href: '#/settings' }, '去设置') : null,
  );
}

export function loadingShelf(count = 6) {
  const row = h('div', { class: 'sk-row' });
  for (let i = 0; i < count; i += 1) {
    row.append(h('div', null,
      h('div', { class: 'skeleton sk-cover' }),
      h('div', { class: 'skeleton sk-line', style: { width: '80%', marginTop: '10px' } }),
      h('div', { class: 'skeleton sk-line', style: { width: '52%', marginTop: '6px' } }),
    ));
  }
  return row;
}

/** @param {string} text */
export async function copy(text) {
  try {
    if (!navigator.clipboard) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
    toast('已复制');
    return;
  } catch (_) {
    /* fall through to the legacy path (plain http on a LAN address) */
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  toast(ok ? '已复制' : '复制失败', !ok);
}

/* ---------- local library ---------- */

export function shelfItems() {
  const list = readStore('shelf', []);
  return Array.isArray(list) ? list : [];
}

/** @param {Book} book */
export function inShelf(book) { return shelfItems().some((item) => item.id === book.id); }

/** @param {Book} book @returns {boolean} now in shelf */
export function toggleShelf(book) {
  const list = shelfItems();
  const index = list.findIndex((item) => item.id === book.id);
  if (index >= 0) list.splice(index, 1);
  else list.unshift({ id: book.id, name: book.name, author: book.author, cover: book.cover, score: book.score, ts: Date.now() });
  writeStore('shelf', list.slice(0, 300));
  return index < 0;
}

export function historyItems() {
  const list = readStore('history', []);
  return Array.isArray(list) ? list : [];
}

/** @param {{id:string,bookId:string,itemId?:string,title:string,cover?:string,kind?:string}} entry */
export function pushHistory(entry) {
  const list = historyItems().filter((item) => item.id !== entry.id);
  list.unshift(Object.assign({ ts: Date.now() }, entry));
  writeStore('history', list.slice(0, 200));
}

/** @param {string} bookId */
export function progressOf(bookId) { return readStore('progress.' + bookId, null); }

/** @param {string} bookId @param {{itemId:string,title:string,pct:number,index:number}} data */
export function saveProgress(bookId, data) {
  writeStore('progress.' + bookId, Object.assign({ ts: Date.now() }, data));
}

/* ---------- router ---------- */

/** @type {Map<string, (root:HTMLElement, ctx:ViewCtx)=>any>} */
const routes = new Map();
/** @type {null|(()=>void)} */
let cleanup = null;
/** @type {AbortController|null} */
let controller = null;
let renderSeq = 0;

/** @param {string} name @param {(root:HTMLElement, ctx:ViewCtx)=>any} mount */
export function route(name, mount) { routes.set(name, mount); }

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const name = segments.shift() || 'home';
  /** @type {Record<string,string>} */
  const params = {};
  segments.forEach((value, index) => { params[index] = value; });
  return { name, params, query: new URLSearchParams(queryPart || '') };
}

/** @param {string} hash @param {boolean} [replace] */
export function go(hash, replace = false) {
  if (replace) history.replaceState(null, '', hash);
  else location.hash = hash;
}

/** @type {Record<string,string>} */
const NAV_OF = { home: 'home', category: 'category', rank: 'category', shelf: 'shelf', history: 'history', dev: 'dev', settings: 'settings', account: 'settings' };

export async function render() {
  const view = el('view');
  const parsed = parseHash();
  const mount = routes.get(parsed.name) || routes.get('home');
  if (!mount) return;

  const seq = ++renderSeq;
  if (controller) controller.abort();
  controller = new AbortController();
  if (cleanup) { try { cleanup(); } catch (_) { /* ignore */ } cleanup = null; }

  resetPaper();
  clear(view);
  view.classList.remove('view-enter');
  void view.offsetWidth;
  view.classList.add('view-enter');
  window.scrollTo({ top: 0, behavior: 'instant' });

  const nav = NAV_OF[parsed.name] || '';
  for (const link of qsa('[data-nav]')) {
    const active = link.dataset.nav === nav;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const back = el('back');
  back.hidden = parsed.name === 'home';
  /** @type {HTMLInputElement} */ (el('global-search')).value = parsed.query.get('q') || '';

  /** @type {ViewCtx} */
  const ctx = {
    params: parsed.params,
    query: parsed.query,
    signal: controller.signal,
    title: (text) => { document.title = text ? text + ' · 番茄小站' : '番茄小站'; },
  };

  try {
    const result = await mount(view, ctx);
    if (seq !== renderSeq) { if (typeof result === 'function') result(); return; }
    cleanup = typeof result === 'function' ? result : null;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    if (seq !== renderSeq) return;
    clear(view);
    view.append(errorState(err, () => render()));
  }
}

/* ---------- theme ---------- */

export function applyTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const dark = cfg.theme === 'dark' || (cfg.theme === 'auto' && media.matches);
  document.body.classList.toggle('dark', dark);
  document.body.classList.toggle('light', !dark);
  document.documentElement.dataset.accent = cfg.accent;
  const icon = qs('#theme-btn i');
  if (icon) icon.textContent = dark ? 'light_mode' : 'dark_mode';
  const meta = qs('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#121110' : '#FDFBF8');
}

export function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  cfg.theme = order[(order.indexOf(cfg.theme) + 1) % order.length];
  saveConfig({ theme: cfg.theme });
  toast(cfg.theme === 'auto' ? '主题：跟随系统' : cfg.theme === 'dark' ? '主题：深色' : '主题：浅色');
}

function resetPaper() {
  document.body.classList.remove('reader-paper', 'reader-night', 'reader-green', 'reader-page');
}

/* ---------- feedback ---------- */

let toastTimer = 0;

/** @param {string} message @param {boolean} [bad] */
export function toast(message, bad = false) {
  const node = el('snackbar');
  clear(node);
  node.append(h('i', null, bad ? 'error' : 'info'), h('span', { class: bad ? 'err' : '' }, message));
  node.classList.add('active');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.classList.remove('active'), bad ? 5200 : 3200);
}

/**
 * @param {{title:string,body?:Node|string,actions?:{label:string,value:string,primary?:boolean}[]}} spec
 * @returns {Promise<string|null>}
 */
export function openDialog(spec) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { 'aria-label': spec.title });
    dialog.append(h('h2', null, spec.title));
    if (spec.body) dialog.append(typeof spec.body === 'string' ? h('p', null, spec.body) : spec.body);
    const nav = h('div', { class: 'dialog-actions' });
    let settled = false;
    const finish = (/** @type {string|null} */ value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    for (const action of spec.actions || [{ label: '知道了', value: 'ok', primary: true }]) {
      nav.append(h('button', {
        class: 'act ' + (action.primary ? 'primary' : 'ghost'),
        type: 'button',
        onclick: () => finish(action.value),
      }, action.label));
    }
    dialog.append(nav);
    dialog.addEventListener('close', () => finish(null));
    el('dialog-host').append(dialog);
    dialog.showModal();
  });
}

/** @param {string} title @param {string} text @param {string} [ok] */
export async function confirmDialog(title, text, ok = '确定') {
  const value = await openDialog({
    title, body: text,
    actions: [{ label: '取消', value: '' }, { label: ok, value: 'ok', primary: true }],
  });
  return value === 'ok';
}

/* ---------- shell ---------- */

let healthTimer = 0;

export async function refreshHealth() {
  const node = el('conn');
  node.className = 'conn wait';
  qs('.conn-text', node).textContent = '检查中';
  try {
    const result = await health();
    const text = qs('.conn-text', node);
    if (result.ready && result.ready.status === 'ok') {
      node.className = 'conn ok';
      text.textContent = '在线 · ' + result.devices;
      node.title = '服务端就绪，设备池 ' + result.devices + ' 个';
    } else if (result.health && result.health.status === 'ok') {
      node.className = 'conn wait';
      text.textContent = '启动中';
      node.title = '服务端正在注册设备，稍等约 20 秒';
    } else {
      node.className = 'conn bad';
      text.textContent = '离线';
      node.title = '连不上服务端，请检查设置';
    }
  } catch (_) {
    node.className = 'conn bad';
    qs('.conn-text', node).textContent = '离线';
  }
  clearTimeout(healthTimer);
  healthTimer = window.setTimeout(refreshHealth, 30000);
}

function bindShell() {
  const form = el('search-form');
  const input = /** @type {HTMLInputElement} */ (el('global-search'));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (value) go('#/search?q=' + encodeURIComponent(value));
    else input.focus();
  });
  input.addEventListener('input', () => { el('clear-search').hidden = !input.value; });
  el('clear-search').addEventListener('click', () => { input.value = ''; el('clear-search').hidden = true; input.focus(); });
  el('back').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else go('#/');
  });
  el('theme-btn').addEventListener('click', cycleTheme);
  window.addEventListener('hashchange', render);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      input.focus();
      input.select();
    } else if (event.key === '/' && document.activeElement && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      event.preventDefault();
      input.focus();
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason instanceof DOMException && reason.name === 'AbortError') return;
    toast(reason && reason.message ? reason.message : '操作失败', true);
  });
}

export function start() {
  bindShell();
  applyTheme();
  refreshHealth();
  render();
  document.documentElement.dataset.ready = '1';
}
