// 短剧、播放、漫画、听书
import {
  api, apiPost, msg, h, clear, qs, route, render, bookOf, seriesOf, commentOf, commentView,
  image, errorState, loadingShelf, toast, openDialog, mediaUrl, dur, trim, safeColor, shelf, seriesCard,
  readStore, writeStore, saveProgress, pushHistory, copy,
} from './core.js';

/* ---------- shared ---------- */

/** @param {any} raw @returns {any[]} */
function videoList(raw) {
  const data = raw && raw.video_data ? raw.video_data : raw || {};
  return Array.isArray(data.video_list) ? data.video_list : [];
}

/** @param {string} seriesId @param {string} vid */
function commentPanel(seriesId, vid) {
  const listHost = h('div', null, h('div', { class: 'skeleton sk-line', style: { width: '100%', height: '72px', margin: '10px 0' } }));
  const count = h('span', { class: 'muted tiny' });
  let hot = false;
  const latestChip = h('button', { class: 'chip active', type: 'button', onclick: () => setMode(false) }, '最新');
  const hotChip = h('button', { class: 'chip', type: 'button', onclick: () => setMode(true) }, '热门');
  const head = h('div', { class: 'section-head' }, h('h2', null, '剧评'), h('div', { class: 'chip-row' }, latestChip, hotChip), count);
  const textarea = h('textarea', { class: 'composer-input', rows: 2, placeholder: '说点什么…', 'aria-label': '写剧评' });
  const composer = h('div', { class: 'comment-composer' },
    textarea,
    h('button', { class: 'act primary', type: 'button', onclick: submit }, h('i', null, 'send'), '发布'),
  );
  const wrap = h('section', null, head, composer, listHost);

  async function load() {
    try {
      const data = hot
        ? await api('/api/v1/series/' + seriesId + '/hot-comments', vid ? { vid } : {})
        : await api('/api/v1/series/' + seriesId + '/comments', vid ? { count: 20, offset: 0, vid } : { count: 20, offset: 0 });
      const items = (data.data && data.data.data_list) || [];
      count.textContent = items.length ? items.length + ' 条' : '';
      clear(listHost);
      if (!items.length) { listHost.append(h('p', { class: 'muted tiny' }, '还没有剧评，来做第一个。')); return; }
      for (const item of items) listHost.append(commentView(commentOf(item), { onDigg: digg, onReply: reply, onReplies: showReplies }));
    } catch (err) {
      clear(listHost);
      listHost.append(errorState(err, load));
    }
  }

  async function submit() {
    const text = textarea.value.trim();
    if (!text) { textarea.focus(); return; }
    try {
      await apiPost('/api/v1/series/' + seriesId + '/comments/add', { text });
      textarea.value = '';
      toast('剧评已发布');
      load();
    } catch (err) { toast(msg(err) || '发布失败', true); }
  }

  async function showReplies(/** @type {any} */ comment) {
    const body = h('div', { class: 'dialog-scroll' }, h('div', { class: 'skeleton sk-line', style: { height: '60px' } }));
    const promise = openDialog({ title: '回复 · ' + comment.user, body, actions: [{ label: '关闭', value: '' }] });
    try {
      const data = await api('/api/v1/series/' + seriesId + '/comments/' + comment.id + '/replies');
      const list = (data.data && (data.data.reply_list || data.data.data_list)) || [];
      clear(body);
      if (!list.length) body.append(h('p', null, '还没有回复。'));
      for (const item of list) body.append(commentView(commentOf(item)));
    } catch (err) {
      clear(body);
      body.append(h('p', null, msg(err) || '回复列表不可用'));
    }
    await promise;
  }

  async function digg(/** @type {any} */ comment) {
    try {
      await apiPost('/api/v1/comments/' + comment.id + '/digg', { series_id: seriesId });
      comment.digg += comment.liked ? -1 : 1;
      comment.liked = !comment.liked;
      toast(comment.liked ? '已点赞' : '已取消点赞');
      load();
    } catch (err) { toast(msg(err) || '点赞失败', true); }
  }

  async function reply(/** @type {any} */ comment) {
    const input = h('textarea', { class: 'composer-input', rows: 3, placeholder: '回复 @' + comment.user, 'aria-label': '回复内容' });
    const value = await openDialog({
      title: '回复 ' + comment.user,
      body: input,
      actions: [{ label: '取消', value: '' }, { label: '发送', value: 'send', primary: true }],
    });
    if (value !== 'send' || !input.value.trim()) return;
    try {
      await apiPost('/api/v1/comments/' + comment.id + '/reply', {
        text: input.value.trim(), series_id: seriesId, reply_to_comment_id: comment.id,
      });
      toast('回复已发送');
      load();
    } catch (err) { toast(msg(err) || '回复失败', true); }
  }

  /** @param {boolean} next */
  function setMode(next) {
    hot = next;
    latestChip.classList.toggle('active', !hot);
    hotChip.classList.toggle('active', hot);
    load();
  }

  load();
  return wrap;
}

/* ---------- series ---------- */

const seriesCache = new Map();

/** @param {string} id @param {AbortSignal} [signal] */
async function loadSeries(id, signal) {
  if (seriesCache.has(id)) return seriesCache.get(id);
  const data = await api('/api/v1/series/' + id, {}, { signal, timeout: 90000 });
  const raw = (data.data && data.data.video_data) || {};
  seriesCache.set(id, raw);
  return raw;
}

route('series', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  const id = ctx.params[0] || '';
  ctx.title('短剧');
  const shell = h('div', null, loadingShelf(3));
  root.append(shell);

  try {
    const raw = await loadSeries(id, ctx.signal);
    const series = seriesOf(raw);
    const episodes = videoList({ video_data: raw });
    if (/\.heic(\?|$)/i.test(series.cover)) {
      try {
        const poster = await api('/api/v1/series/' + id + '/share');
        const url = poster.data && poster.data.poster_cover_url;
        if (url) series.cover = url;
      } catch (_) { /* 海报取不到就退回占位 */ }
    }
    ctx.title('短剧');

    const first = episodes[0] || raw;
    const hero = h('section', { class: 'detail-panel series', style: { '--tint': safeColor(series.color) } },
      h('div', { class: 'detail-cover wide' },
        image(series.cover, series.title),
        h('span', { class: 'cover-fallback' }, series.title),
      ),
      h('div', { class: 'detail-main' },
        h('span', { class: 'tag' }, '短剧'),
        h('h1', null, series.title),
        h('div', { class: 'detail-stats' },
          series.episodes ? h('span', null, h('b', null, series.episodes), ' 集') : null,
          series.duration ? h('span', null, '共 ' + dur(series.duration)) : null,
          series.playText ? h('span', null, series.playText) : null,
        ),
        h('p', { class: 'prose clamp3' }, trim(series.intro, 220)),
        h('div', { class: 'detail-actions' },
          first && first.vid ? h('a', { class: 'act primary', href: '#/watch/' + id + '/' + first.vid }, '开始播放') : null,
          h('button', { class: 'act ghost', type: 'button', title: '分享', 'aria-label': '分享', onclick: () => share(id) }, h('i', null, 'share')),
        ),
      ),
    );

    const episodeSection = h('section', { class: 'shelf' },
      h('div', { class: 'section-head' }, h('h2', null, '选集'), h('span', null, episodes.length + ' 集')),
      h('div', { class: 'episode-grid' }, episodes.map((/** @type {any} */ item, /** @type {any} */ index) => h('a', {
        class: 'ep-btn', href: '#/watch/' + id + '/' + item.vid,
        title: item.title || '', style: { display: 'grid', placeItems: 'center' },
      }, index + 1))),
    );

    clear(shell);
    const related = h('div');
    shell.append(hero, episodeSection, related, commentPanel(id, first && first.vid ? first.vid : ''));
    api('/api/v1/series/' + id + '/related').then((data) => {
      const list = (data && data.data) || [];
      if (!Array.isArray(list) || !list.length) return;
      const items = list.map(seriesOf).filter((item) => item.id);
      if (items.length) related.append(shelf('相关短剧', items.map(seriesCard)));
    }).catch(() => { /* 相关推荐不是必需 */ });
    pushHistory({ id: 'series:' + id, bookId: id, title: series.title, cover: series.cover, kind: 'series' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    clear(shell);
    shell.append(errorState(err, () => render()));
  }
});

/** @param {string} id */
async function share(id) {
  try {
    const data = await api('/api/v1/series/' + id + '/share');
    const info = data.data || {};
    const link = info.share_url || info.schema || info.poster_cover_url;
    const value = await openDialog({
      title: '分享短剧',
      body: h('div', null, h('p', null, info.text || info.sub_text || '把这部剧分享给朋友'), h('div', { class: 'code-box' }, String(link || '没有分享链接'))),
      actions: [{ label: '关闭', value: '' }, link ? { label: '复制', value: 'copy', primary: true } : { label: '知道了', value: 'ok', primary: true }],
    });
    if (value === 'copy' && link) copy(String(link));
  } catch (err) { toast(msg(err) || '分享失败', true); }
}

/* ---------- watch ---------- */

route('watch', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  const seriesId = ctx.params[0] || '';
  const vid = ctx.params[1] || '';
  ctx.title('播放');

  const video = h('video', { controls: true, playsinline: true, preload: 'metadata', 'aria-label': '短剧播放器' });
  const layer = h('div', { class: 'danmaku-layer' });
  const note = h('div', { class: 'stage-note' }, h('div', null, h('progress', { class: 'circle' }), h('div', { style: { marginTop: '10px' } }, '正在准备视频，首次播放需要服务端解密…')));
  const stage = h('div', { class: 'watch-stage' }, video, layer, note);
  const title = h('h1', null, '载入中…');
  const meta = h('div', { class: 'muted tiny' });
  const actions = h('div', { class: 'watch-actions' });
  const body = h('div', null, stage, h('div', { class: 'watch-meta' }, h('div', { class: 'max', style: { minWidth: 0 } }, title, meta), actions));
  const extra = h('div', null);
  root.append(body, extra);

  /** @type {any} */
  let rawSeries = null;
  /** @type {any[]} */
  let episodes = [];
  /** @type {{text:string,time:number,self:boolean}[]} */
  let danmaku = [];
  /** @type {{text:string,time:number,self:boolean}[]} */
  let allDanmaku = [];
  let showDanmaku = readStore('danmaku', true) !== false;

  /** @param {any[]} list */
  function setEpisodes(list) {
    episodes = list;
    const grid = h('div', { class: 'episode-grid' }, episodes.map((/** @type {any} */ item, /** @type {any} */ index) => h('a', {
      class: 'ep-btn' + (String(item.vid) === String(vid) ? ' active' : ''), href: '#/watch/' + seriesId + '/' + item.vid,
      style: { display: 'grid', placeItems: 'center' }, title: item.title || '',
    }, index + 1)));
    extra.prepend(h('section', { class: 'shelf' }, h('div', { class: 'section-head' }, h('h2', null, '选集'), h('span', null, episodes.length + ' 集')), grid));
  }

  /** @param {number} duration */
  async function loadDanmaku(duration) {
    try {
      const data = await api('/api/v1/videos/' + vid + '/danmaku', { series_id: seriesId, playlet_item_duration: Math.round(duration || 0) });
      const list = (data.data && data.data.data_list) || [];
      danmaku = list.map((/** @type {any} */ item) => {
        const c = commentOf(item);
        const offset = item && item.comment && item.comment.expand ? Number(item.comment.expand.offset_time) || 0 : 0;
        return { text: c.text, time: offset / 1000, self: false };
      }).filter((/** @type {any} */ item) => item.text);
    } catch (_) { danmaku = []; }
  }

  async function loadVideo() {
    const data = await api('/api/v1/videos/' + vid, {}, { timeout: 240000, signal: ctx.signal });
    const url = data.video_url || (data.video_info && data.video_info.data && data.video_info.data.video_list && Object.values(data.video_info.data.video_list)[0]?.main_url);
    if (!url) throw new Error('没有拿到可播放的视频地址');
    if (!stage.isConnected) return;
    video.src = mediaUrl(url);
    note.hidden = true;
    video.muted = true;
    video.play().then(() => toast('已静音自动播放，点播放器音量开启声音')).catch(() => { /* autoplay may be blocked */ });
    const episode = episodes.find((item) => String(item.vid) === String(vid));
    await loadDanmaku(Number(episode && episode.duration) || data.duration || (rawSeries && rawSeries.duration) || 300);
    startDanmaku();
  }

  let raf = 0;
  let pausedAt = 0;
  /** @type {{el:HTMLElement,start:number,distance:number}[]} */
  let active = [];
  let cursor = 0;
  let lastTime = 0;

  /** @param {string} text @param {boolean} self */
  function spawn(text, self) {
    if (layer.childElementCount > 60) return;
    const el = h('span', { class: 'dm' + (self ? ' self' : '') }, text);
    const lanes = 9;
    const lane = cursor % lanes;
    cursor += 1;
    el.style.top = 8 + lane * 30 + 'px';
    layer.append(el);
    active.push({ el, start: performance.now(), distance: stage.clientWidth + 320 });
  }

  function startDanmaku() {
    if (!stage.isConnected) return;
    if (raf) cancelAnimationFrame(raf);
    const tick = () => {
      if (!video.paused && !video.ended) {
        const now = performance.now();
        if (pausedAt) { active.forEach((/** @type {any} */ item) => { item.start += now - pausedAt; }); pausedAt = 0; }
        const time = video.currentTime;
        if (time < lastTime - 1) { cursor = 0; danmaku = allDanmaku.filter((d) => d.time >= time - 1); } // 回退
        lastTime = time;
        if (showDanmaku) {
          while (danmaku.length && danmaku[0].time <= time + 0.25) {
            const item = danmaku.shift();
            if (!item) break;
            if (item.time >= time - 1) spawn(item.text, false);
          }
        }
        for (let i = active.length - 1; i >= 0; i -= 1) {
          const item = active[i];
          const p = (now - item.start) / 9000;
          if (p >= 1 || p < 0) { item.el.remove(); active.splice(i, 1); continue; }
          item.el.style.transform = 'translateX(' + (-p * item.distance) + 'px)';
        }
      } else if (video.paused && !pausedAt) {
        pausedAt = performance.now();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  video.addEventListener('error', () => {
    note.hidden = false;
    clear(note);
    note.append(h('div', null, h('i', { class: 'large' }, 'error'), h('p', null, '浏览器无法播放这个视频。'), h('button', {
      class: 'act tonal', type: 'button', onclick: () => { video.load(); loadVideo().catch((err) => toast(msg(err), true)); },
    }, '重试')));
  });

  const composerText = h('input', { class: 'composer-input', type: 'text', placeholder: '发一条弹幕…', maxLength: 40, 'aria-label': '弹幕内容' });
  const composer = h('form', { class: 'dm-composer' },
    composerText,
    h('button', { class: 'act tonal', type: 'submit' }, h('i', null, 'send'), '发送'),
  );
  composer.addEventListener('submit', async (/** @type {any} */ event) => {
    event.preventDefault();
    const text = composerText.value.trim();
    if (!text) return;
    try {
      await apiPost('/api/v1/videos/' + vid + '/danmaku/add', { text, series_id: seriesId });
      composerText.value = '';
      spawn(text, true);
      toast('弹幕已发送');
    } catch (err) { toast(msg(err) || '发送失败（需要令牌）', true); }
  });

  const dmBtn = h('button', { class: 'act ghost small', type: 'button', onclick: () => {
    showDanmaku = !showDanmaku;
    writeStore('danmaku', showDanmaku);
    clear(dmBtn);
    dmBtn.append(h('i', null, showDanmaku ? 'visibility' : 'visibility_off'), showDanmaku ? '弹幕开' : '弹幕关');
  } }, h('i', null, showDanmaku ? 'visibility' : 'visibility_off'), showDanmaku ? '弹幕开' : '弹幕关');
  actions.append(dmBtn);

  try {
    rawSeries = await loadSeries(seriesId, ctx.signal).catch(() => null);
    const series = seriesOf(rawSeries || {});
    title.textContent = series.title || '播放';
    meta.textContent = [series.episodes ? series.episodes + ' 集' : '', series.playText, '服务端解密播放'].filter(Boolean).join(' · ');
    actions.append(
      h('button', { class: 'act ghost small', type: 'button', onclick: showVariants }, h('i', null, 'high_quality'), '清晰度'),
      h('button', { class: 'act ghost small', type: 'button', onclick: () => share(seriesId) }, h('i', null, 'share'), '分享'),
    );
    setEpisodes(videoList({ video_data: rawSeries }));
    extra.append(composer, commentPanel(seriesId, vid));
    await loadVideo();
    pushHistory({ id: 'watch:' + vid, bookId: seriesId, itemId: vid, title: series.title, cover: series.cover, kind: 'series' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    clear(note);
    note.append(h('div', null, h('p', null, msg(err) || '视频加载失败'))); 
    note.hidden = false;
  }

  async function showVariants() {
    try {
      const data = await api('/api/v1/videos/' + vid, { mode: 'stream' });
      const variants = data.variants || [];
      const body = h('div', null,
        h('p', null, '上游返回的清晰度列表：' + (variants.length ? variants.map((/** @type {any} */ v) => v.name || (v.height + 'p')).join(' / ') : '单流（没有清晰度信息）')),
        h('p', null, '浏览器无法直接解密 CENC 密文，所以本页统一使用服务端解密后的 /src 流播放；清晰度切换需要上游支持明流。'),
        data.key_hex ? h('div', { class: 'code-box' }, 'key_hex: ' + data.key_hex) : null,
      );
      await openDialog({ title: '清晰度与密钥', body, actions: [{ label: '知道了', value: 'ok', primary: true }] });
    } catch (err) { toast(msg(err) || '清晰度信息不可用', true); }
  }

  return () => {
    if (raf) cancelAnimationFrame(raf);
    video.pause();
    video.removeAttribute('src');
    video.load();
    layer.replaceChildren();
  };
});

/* ---------- manga ---------- */

route('manga', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  const bookId = ctx.params[0] || '';
  const itemId = ctx.params[1] || '';
  ctx.title('漫画');

  const bar = h('div', { class: 'manga-bar' },
    h('a', { class: 'icon-btn', href: '#/book/' + bookId, 'aria-label': '返回详情' }, h('i', null, 'arrow_back')),
    h('div', { class: 'max', style: { minWidth: 0 } }, h('strong', { class: 'title' }, '漫画')),
    h('span', { class: 'tiny muted' }, ''),
    h('button', { class: 'icon-btn', type: 'button', title: '章节', onclick: openChapters }, h('i', null, 'format_list_bulleted')),
    h('button', { class: 'icon-btn', type: 'button', title: '返回顶部', onclick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) }, h('i', null, 'vertical_align_top')),
  );
  const stage = h('div', { class: 'state', style: { minHeight: '50vh' } },
    h('div', { class: 'state-shape' }, h('i', null, 'image')),
    h('h2', null, '正在解密漫画'),
    h('p', null, '每张图片都由服务端解密后通过 /src 提供，第一次打开会稍慢。'),
    h('progress', { class: 'circle' }),
  );
  root.append(bar, stage);

  /** @type {any[]} */
  let toc = [];
  let item = null;

  async function openChapters() {
    if (!toc.length) { toast('目录还没加载好'); return; }
    const list = h('div', { class: 'toc', style: { maxHeight: '52vh', overflow: 'auto' } });
    for (const chapter of toc) {
      list.append(h('a', { class: 'toc-item' + (String(chapter.item_id) === String(itemId) ? ' active' : ''), href: '#/manga/' + bookId + '/' + chapter.item_id },
        h('span', null, chapter.title || '')));
    }
    await openDialog({ title: '选择章节', body: list, actions: [{ label: '关闭', value: '' }] });
  }

  /** @param {string} position */
  function pager(position) {
    const index = toc.findIndex((chapter) => String(chapter.item_id) === String(itemId));
    const prev = index > 0 ? toc[index - 1] : null;
    const next = index >= 0 && index < toc.length - 1 ? toc[index + 1] : null;
    return h('div', { class: 'manga-pager' },
      prev ? h('a', { class: 'act ghost', href: '#/manga/' + bookId + '/' + prev.item_id }, h('i', null, 'chevron_left'), '上一话') : h('span'),
      h('span', { class: 'tiny muted' }, position),
      next ? h('a', { class: 'act primary', href: '#/manga/' + bookId + '/' + next.item_id }, '下一话', h('i', null, 'chevron_right')) : h('span'),
    );
  }

  try {
    const [dirResult, mangaResult] = await Promise.all([
      toc.length ? Promise.resolve(null) : api('/api/v1/books/' + bookId + '/directory', {}, { signal: ctx.signal, timeout: 120000 }).catch(() => null),
      api('/api/v1/manga/' + itemId, { book_id: bookId }, { signal: ctx.signal, timeout: 240000 }),
    ]);
    if (dirResult && dirResult.data) toc = dirResult.data.item_data_list || [];
    item = toc.find((/** @type {any} */ chapter) => String(chapter.item_id) === String(itemId)) || null;
    const images = mangaResult.images || [];
    if (!images.length) throw new Error('这一话没有图片');

    const series = bookOf((dirResult && dirResult.data && dirResult.data.book_info) || {});
    const title = item ? item.title : (series.name || '漫画');
    const titleNode = qs('.title', bar);
    if (titleNode) titleNode.textContent = title;
    const countNode = qs('.manga-bar .tiny', bar);
    if (countNode) countNode.textContent = images.length + ' 页';
    ctx.title(title);

    const scroll = h('div', { class: 'manga-scroll' });
    images.forEach((/** @type {any} */ src, /** @type {any} */ index) => {
      const page = h('div', { class: 'manga-page' },
        image(src, '第 ' + (index + 1) + ' 页'),
        h('span', { class: 'idx' }, index + 1 + ' / ' + images.length),
      );
      scroll.append(page);
    });
    clear(stage);
    stage.replaceWith(scroll);
    root.append(pager(images.length + ' 页'));
    pushHistory({ id: 'manga:' + bookId, bookId, itemId, title, cover: series.cover, kind: 'manga' });
    saveProgress(bookId, { itemId, title, index: 0, pct: 100 });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    clear(stage);
    stage.append(errorState(err, () => render()));
  }
});

/* ---------- audio ---------- */

/** @param {string} text @returns {{ms:number,text:string}[]} */
function parseTranscript(text) {
  const out = [];
  for (const line of String(text || '').split(/\n+/)) {
    const match = line.match(/^\[(\d+),\d+\](?:<[^>]*>)?(.*)$/);
    if (match && match[2].trim()) out.push({ ms: Number(match[1]), text: match[2].trim() });
  }
  if (!out.length && text) out.push({ ms: 0, text: String(text).slice(0, 4000) });
  return out;
}

route('audio', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  const bookId = ctx.params[0] || '';
  const wanted = ctx.query.get('cid') || '';
  ctx.title('听书');

  const head = h('div', { class: 'audio-head' }, h('div', { class: 'skeleton', style: { width: '132px', height: '132px', borderRadius: '26px' } }), h('div', null, h('h1', null, '载入中…')));
  const body = h('div', null, loadingShelf(2));
  root.append(head, body);

  /** @type {any[]} */
  let toc = [];
  let detail = null;

  /** @param {string} chapterId @param {string} title */
  async function openPlayInfo(chapterId, title) {
    const content = h('div', null, h('p', null, '正在请求播放信息…'));
    const promise = openDialog({ title: '播放信息 · ' + title, body: content, actions: [{ label: '关闭', value: '' }] });
    try {
      const [chapter, play, points] = await Promise.all([
        api('/api/v1/audio/books/' + bookId + '/chapters/' + chapterId),
        api('/api/v1/audio/play', { item_ids: chapterId, book_id: bookId }).catch((err) => ({ error: msg(err) })),
        api('/api/v1/chapters/' + chapterId + '/timepoints', { book_id: bookId }).catch(() => null),
      ]);
      const data = (chapter.data && chapter.data[0]) || {};
      clear(content);
      content.append(
        h('div', { class: 'kv' }, h('span', null, '是否加密'), h('span', null, data.is_encrypt ? '是（' + (data.encryption_key ? '有密钥' : '无密钥') + '）' : '否')),
        h('div', { class: 'kv' }, h('span', null, '音质'), h('span', null, String(data.quality || ''))),
        h('div', { class: 'kv' }, h('span', null, '时长'), h('span', null, data.duration ? dur(data.duration) : '—')),
        h('div', { class: 'code-box', style: { marginTop: '10px' } }, String(data.main_url || '没有 main_url')),
        h('div', { class: 'kv' }, h('span', null, 'audio/play'), h('span', null, play.error ? play.error : ('code ' + (play.code ?? 0) + ' · ' + (play.message || '')))),
        h('div', { class: 'kv' }, h('span', null, '时间点映射'), h('span', null, points && points.para_match_data ? '可用' : '不可用')),
        h('p', { class: 'tiny muted', style: { marginTop: '10px' } }, '浏览器没有上游的内容密钥与解密实现，因此这里只展示播放信息，不伪装成可播放。'),
      );
      const audio = new Audio(data.main_url);
      audio.preload = 'metadata';
      audio.addEventListener('error', () => toast('浏览器无法解码：上游音频已加密', true), { once: true });
      audio.load();
    } catch (err) {
      clear(content);
      content.append(h('p', null, msg(err) || '播放信息不可用'));
    }
    await promise;
  }

  /** @param {string} chapterId */
  async function loadChapter(chapterId) {
    if (!chapterId) return;
    const chapter = toc.find((/** @type {any} */ item) => String(item.item_id) === String(chapterId));
    const title = chapter ? chapter.title : '文稿';
    clear(body);
    body.append(h('div', { class: 'audio-notice' },
      h('i', null, 'headphones'),
      h('div', null, h('strong', null, '以文稿模式呈现'), h('div', null, '上游音频是加密 AAC，浏览器无法直接播放；下方按时间轴展示官方文稿，不做假播放。'), h('div', { style: { marginTop: '8px' } }, h('button', { class: 'act ghost small', type: 'button', onclick: () => openPlayInfo(chapterId, title) }, h('i', null, 'info'), '查看播放信息'))),
    ));
    const panel = h('section', { class: 'shelf' }, h('div', { class: 'section-head' }, h('h2', null, '文稿'), h('span', null, title)), h('div', { class: 'transcript' }, h('div', { class: 'skeleton sk-line', style: { height: '120px' } })));
    body.append(panel);
    try {
      const data = await api('/api/v1/audio/wkcontent/' + chapterId, {}, { signal: ctx.signal, timeout: 90000 });
      const lines = parseTranscript(data.data && data.data.speech_text);
      const transcript = qs('.transcript', panel);
      clear(transcript);
      if (!lines.length) { transcript.append(h('p', { class: 'muted' }, '这一章没有文稿。')); return; }
      for (const line of lines) {
        const row = h('div', { class: 'tr-line' },
          h('span', { class: 'ts' }, clockOf(line.ms)),
          h('span', null, line.text),
        );
        row.addEventListener('click', () => {
          for (const node of transcript.children) node.classList.remove('active');
          row.classList.add('active');
        });
        transcript.append(row);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      clear(panel);
      panel.append(errorState(err, () => loadChapter(chapterId)));
    }
  }

  try {
    const [detailData, dirData, toneData] = await Promise.all([
      api('/api/v1/audio/books/' + bookId, {}, { signal: ctx.signal }),
      api('/api/v1/books/' + bookId + '/directory', {}, { signal: ctx.signal, timeout: 120000 }).catch(() => null),
      api('/api/v1/books/' + bookId + '/tones', {}, { signal: ctx.signal }).catch(() => null),
    ]);
    detail = detailData.data || {};
    const book = bookOf(detail);
    toc = (dirData && dirData.data && dirData.data.item_data_list) || [];
    ctx.title('听书');
    clear(head);
    head.append(
      h('div', { class: 'audio-cover' }, image(book.cover, book.name), h('span', { class: 'cover-fallback' }, book.name)),
      h('div', { class: 'max' },
        h('h1', null, book.name || '听书'),
        h('div', { class: 'muted' }, book.author),
        h('div', { class: 'chip-row', style: { marginTop: '12px' } },
          book.score ? h('span', { class: 'tag' }, '★ ' + book.score) : null,
          book.chapters ? h('span', { class: 'tag' }, book.chapters + ' 章') : null,
          detail.duration ? h('span', { class: 'tag' }, '共 ' + dur(detail.duration)) : null,
          book.tags.slice(0, 3).map((/** @type {any} */ tag) => h('span', { class: 'tag' }, tag)),
        ),
      ),
    );
    const tones = (toneData && toneData.data && toneData.data.tts_tones) || [];
    if (tones.length) {
      body.append(h('section', { class: 'shelf' },
        h('div', { class: 'section-head' }, h('h2', null, '音色'), h('span', null, '上游 TTS 提供')),
        h('div', { class: 'chip-row' }, tones.slice(0, 8).map((/** @type {any} */ tone) => h('button', {
          class: 'chip', type: 'button', title: tone.description || '',
          onclick: () => toast('音色「' + (tone.title || '') + '」由上游 TTS 提供，浏览器端无法合成播放'),
        }, h('i', null, 'record_voice_over'), tone.title || String(tone.id)))),
      ));
    }
    if (!toc.length) throw new Error('没有拿到听书目录');
    const first = wanted || toc[0].item_id;
    const chapterSection = h('section', { class: 'shelf' },
      h('div', { class: 'section-head' }, h('h2', null, '章节'), h('span', null, toc.length + ' 章')),
      h('div', { class: 'toc', style: { maxHeight: '360px', overflow: 'auto' } }, toc.map((/** @type {any} */ chapter) => h('button', {
        class: 'toc-item' + (String(chapter.item_id) === String(first) ? ' active' : ''), type: 'button',
        onclick: (/** @type {any} */ event) => {
          for (const node of qs('.toc', chapterSection).children) node.classList.remove('active');
          /** @type {HTMLElement} */ (event.currentTarget).classList.add('active');
          loadChapter(chapter.item_id);
        },
      }, h('span', null, chapter.title || '')))),
    );
    body.prepend(chapterSection);
    await loadChapter(first);
    pushHistory({ id: 'audio:' + bookId, bookId, itemId: first, title: book.name, cover: book.cover, kind: 'audio' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    clear(body);
    body.append(errorState(err, () => render()));
  }
});

/** @param {number} ms */
function clockOf(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}
