// 榜单、作者、书旗、书架、足迹、设置、账号、接口实验室
import {
  api, apiPost, msg, h, clear, qs, route, go, render, bookOf, image, bookCard, emptyState,
  errorState, loadingShelf, toast, confirmDialog, mediaUrl, num, when, trim,
  writeStore, dropStore, shelfItems, historyItems, progressOf, saveProgress, pushHistory,
  cfg, saveConfig, copy,
} from './core.js';

/* ---------- rank ---------- */

/** @param {any} data */
function rankBooks(data) {
  const cells = (data && data.cell_view && data.cell_view.cell_data) || [];
  /** @type {any[]} */
  const out = [];
  /** @param {any[]} items */
  const walk = (items) => {
    for (const item of items || []) {
      if (Array.isArray(item.book_data)) out.push(...item.book_data);
      else if (Array.isArray(item.cell_data)) walk(item.cell_data);
      else if (item.book_id) out.push(item);
    }
  };
  walk(cells);
  return out.map(bookOf).filter((b) => b.id);
}

route('rank', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  const id = ctx.params[0] || '';
  ctx.title('榜单');
  const head = h('section', { class: 'page-head' }, h('div', { class: 'grow' }, h('p', null, '按热度与口碑排序。')));
  const body = h('div', null, loadingShelf(4));
  root.append(head, body);

  let offset = 0;
  let hasMore = true;
  const grid = h('div', { class: 'rank-grid', style: { marginTop: '10px' } });
  const more = h('div', { class: 'toc-more' });

  async function load(reset = false) {
    if (reset) { offset = 0; hasMore = true; clear(grid); }
    try {
      const data = await api('/api/v1/rank/' + id, { algo_type: 1, offset, count: 20 }, { signal: ctx.signal });
      const payload = data.data || {};
      const books = rankBooks(payload);
      clear(body);
      body.append(grid);
      for (const book of books) {
        const index = grid.childElementCount + 1;
        grid.append(h('a', { class: 'rank-item', href: '#/book/' + book.id },
          h('div', { class: 'idx' }, index),
          image(book.cover, book.name),
          h('div', { class: 'r-meta' }, h('strong', null, book.name), h('small', null, [book.author, book.readText].filter(Boolean).join(' · '))),
        ));
      }
      offset = Number(payload.next_offset) || offset + books.length;
      hasMore = Boolean(payload.has_more);
      if (!grid.childElementCount) body.append(emptyState({ icon: 'leaderboard', title: '榜单暂无数据' }));
      if (hasMore) {
        clear(more);
        more.append(h('button', { class: 'act tonal', type: 'button', onclick: () => load() }, h('i', null, 'expand_more'), '加载更多'));
        body.append(more);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      clear(body);
      body.append(errorState(err, () => load(true)));
    }
  }
  await load(true);
});

/* ---------- author ---------- */

route('author', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  const id = ctx.params[0] || '';
  ctx.title('作者');
  const body = h('div', null, loadingShelf(4));
  root.append(body);
  try {
    const [info, shelf] = await Promise.all([
      api('/api/v1/authors/' + id, {}, { signal: ctx.signal }),
      api('/api/v1/authors/' + id + '/bookshelf', { count: 20, offset: 0 }, { signal: ctx.signal }).catch(() => null),
    ]);
    const data = info.data || {};
    const books = (shelf && shelf.data && (shelf.data.items || []).map((/** @type {any} */ item) => item.book)) || data.author_book_info || [];
    const first = books[0] || {};
    const author = data.author_info || data;
    const name = author.user_name || author.author_name || author.name || first.author || '作者';
    const avatar = author.expand_user_avatar || author.avatar_url || first.avatar_url || '';
    ctx.title('作者');
    clear(body);
    body.append(
      h('section', { class: 'page-head' },
        avatar ? h('img', { src: mediaUrl(avatar), alt: name, style: { width: '84px', height: '84px', borderRadius: '50%', objectFit: 'cover' } }) : h('div', { class: 'state-shape', style: { width: '84px', height: '84px' } }, h('i', null, 'person')),
        h('div', { class: 'grow' }, h('h1', null, name), h('p', null, author.author_desc || author.description || '')),
        author.fans_num ? h('span', { class: 'tag' }, num(author.fans_num) + ' 粉丝') : null,
        books.length ? h('span', { class: 'tag' }, books.length + ' 部作品') : null,
      ),
    );
    const bookList = books.map(bookOf).filter((/** @type {any} */ b) => b.id);
    if (bookList.length) body.append(h('section', { class: 'shelf' }, h('div', { class: 'section-head' }, h('h2', null, '作品')), h('div', { class: 'grid-books' }, bookList.map((/** @type {any} */ book) => bookCard(book)))));
    else body.append(emptyState({ icon: 'auto_stories', title: '没有公开作品' }));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    clear(body);
    body.append(errorState(err, () => render()));
  }
});

/* ---------- shuqi ---------- */

/** @param {any} book */
function shuqiCard(book) {
  return h('a', { class: 'book-card', href: '#/shuqi/' + encodeURIComponent(book.bookId || book.book_id || '') },
    h('div', { class: 'cover' },
      image(book.coverUrl || book.cover || '', book.name || ''),
      h('div', { class: 'cover-fallback' }, h('span', null, book.name || '')),
      h('span', { class: 'corner' }, '书旗'),
    ),
    h('div', { class: 'meta' },
      h('strong', null, book.name || ''),
      h('small', null, [book.author, book.kind ? trim(String(book.kind).split(',').join(' · '), 18) : ''].filter(Boolean).join(' · ')),
    ),
  );
}

route('shuqi', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  const bookId = ctx.params[0] || '';
  if (bookId) { await shuqiBook(root, ctx, bookId); return; }
  ctx.title('书旗');
  const q = (ctx.query.get('q') || '').trim();
  const form = h('form', { class: 'search-big', role: 'search' },
    h('i', null, 'storefront'),
    h('input', { type: 'search', value: q, placeholder: '搜索书旗小说', 'aria-label': '书旗搜索' }),
    h('button', { class: 'act primary', type: 'submit' }, '搜索'),
  );
  form.addEventListener('submit', (/** @type {any} */ event) => {
    event.preventDefault();
    const value = qs('input', form).value.trim();
    if (value) go('#/shuqi?q=' + encodeURIComponent(value));
  });
  const body = h('div', null);
  root.append(h('section', { class: 'page-head' }, h('div', { class: 'grow' }, h('p', null, '独立于番茄的第二个书源。'))), form, body);
  if (!q) { body.append(emptyState({ icon: 'storefront', title: '搜一本书', text: '书旗源不需要番茄设备身份，适合做备用书源。' })); return; }
  body.append(loadingShelf(4));
  try {
    const data = await api('/api/v1/shuqi/search', { key: q }, { signal: ctx.signal });
    const list = (data.data || []).filter((/** @type {any} */ item) => item && (item.bookId || item.name));
    clear(body);
    if (!list.length) { body.append(emptyState({ icon: 'search_off', title: '书旗没有找到结果', text: '换个关键词试试。' })); return; }
    body.append(h('div', { class: 'grid-books' }, list.map(shuqiCard)));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    clear(body);
    body.append(errorState(err, () => render()));
  }
});

/** @param {HTMLElement} root @param {any} ctx @param {string} bookId */
async function shuqiBook(root, ctx, bookId) {
  const body = h('div', null, loadingShelf(3));
  root.append(body);
  const chapterList = h('div', { class: 'toc' });
  let shown = 0;
  /** @type {any[]} */
  let chapters = [];
  try {
    const [bookData, tocData] = await Promise.all([
      api('/api/v1/shuqi/book', { book_id: bookId }, { signal: ctx.signal }),
      api('/api/v1/shuqi/toc', { book_id: bookId }, { signal: ctx.signal, timeout: 120000 }),
    ]);
    const book = bookData.data || {};
    chapters = (tocData.data && tocData.data.chapters) || [];
    ctx.title('书旗');
    clear(body);
    body.append(h('section', { class: 'detail-panel' },
      h('div', { class: 'detail-cover' },
        image(book.coverUrl || '', book.name || ''),
        h('span', { class: 'cover-fallback' }, book.name || '书旗'),
      ),
      h('div', { class: 'detail-main' },
        h('span', { class: 'tag' }, '书旗 · ' + (book.status || '')),
        h('h1', null, book.name || ''),
        h('div', { class: 'detail-author' }, h('i', null, 'person'), book.author || ''),
        h('div', { class: 'detail-stats' },
          book.chapterTotalNum ? h('span', null, h('b', null, book.chapterTotalNum), ' 章') : null,
          book.wordCount ? h('span', null, book.wordCount) : null,
          book.kind ? h('span', null, String(book.kind).split(',').slice(0, 3).join(' · ')) : null,
        ),
        h('p', { class: 'prose clamp3' }, trim(book.intro || '', 240)),
        h('div', { class: 'detail-actions' },
          chapters.length ? h('a', { class: 'act primary', href: '#/shuqi-read/' + bookId + '/' + chapters[0].chapterId }, '开始阅读') : null,
          h('button', { class: 'act ghost', type: 'button', title: '复制链接', 'aria-label': '复制链接', onclick: () => copy(location.href) }, h('i', null, 'link')),
        ),
      ),
    ));
    body.append(h('section', { class: 'shelf' },
      h('div', { class: 'section-head' }, h('h2', null, '目录'), h('span', null, chapters.length + ' 章')),
      chapterList,
    ));
    renderChapters();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    clear(body);
    body.append(errorState(err, () => render()));
  }

  function renderChapters() {
    const end = Math.min(chapters.length, shown + 200);
    for (let i = shown; i < end; i += 1) {
      const chapter = chapters[i];
      chapterList.append(h('a', { class: 'toc-item', href: '#/shuqi-read/' + bookId + '/' + (chapter.chapterId || chapter.url) },
        h('i', null, chapter.isVip ? 'lock' : 'article'),
        h('span', null, chapter.title || ''),
      ));
    }
    shown = end;
    const old = qs('.toc-more', chapterList.parentElement);
    if (old) old.remove();
    if (shown < chapters.length) {
      chapterList.parentElement.append(h('div', { class: 'toc-more' }, h('button', { class: 'act tonal', type: 'button', onclick: renderChapters }, '加载更多（' + (chapters.length - shown) + '）')));
    }
  }
}

route('shuqi-read', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  const bookId = ctx.params[0] || '';
  const chapterId = ctx.params[1] || '';
  ctx.title('书旗阅读');
  const titleNode = h('div', { class: 'title' }, '载入中…');
  const bar = h('div', { class: 'reader-bar' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': '返回目录', onclick: () => go('#/shuqi/' + bookId, true) }, h('i', null, 'arrow_back')),
    titleNode,
    h('button', { class: 'icon-btn', type: 'button', title: '复制链接', onclick: () => copy(location.href) }, h('i', null, 'link')),
  );
  const article = h('article', { class: 'reader' }, h('div', { class: 'skeleton sk-line', style: { height: '200px' } }));
  root.append(bar, h('div', { class: 'reader-wrap' }, article));
  document.body.classList.add('reader-page', 'reader-paper');
  try {
    const [data, tocData] = await Promise.all([
      api('/api/v1/shuqi/chapter', { book_id: bookId, chapter_id: chapterId }, { signal: ctx.signal, timeout: 90000 }),
      api('/api/v1/shuqi/toc', { book_id: bookId }, { signal: ctx.signal, timeout: 120000 }).catch(() => null),
    ]);
    const chapter = data.data || {};
    const chapters = (tocData && tocData.data && tocData.data.chapters) || [];
    const index = chapters.findIndex((/** @type {any} */ item) => String(item.chapterId) === String(chapterId));
    const found = index >= 0 ? chapters[index] : null;
    const title = (found && found.title) || chapter.chapterName || chapter.title || chapter.name || ('第 ' + chapterId + ' 章');
    titleNode.textContent = title;
    ctx.title(title);
    clear(article);
    article.append(h('h1', null, title));
    const paragraphs = String(chapter.content || '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
    for (const line of paragraphs) article.append(h('p', null, line));
    if (!paragraphs.length) article.append(h('p', null, '这一章没有正文。'));
    const prev = index > 0 ? chapters[index - 1] : null;
    const next = index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : null;
    article.append(h('div', { class: 'reader-nav' },
      prev ? h('a', { class: 'act ghost', href: '#/shuqi-read/' + bookId + '/' + prev.chapterId }, h('i', null, 'chevron_left'), '上一章') : h('span'),
      next ? h('a', { class: 'act ghost', href: '#/shuqi-read/' + bookId + '/' + next.chapterId }, '下一章', h('i', null, 'chevron_right')) : h('span'),
    ));
    saveProgress(bookId, { itemId: chapterId, title, index, pct: chapters.length ? Math.round(((index + 1) / chapters.length) * 100) : 0 });
    pushHistory({ id: 'shuqi:' + bookId, bookId, itemId: chapterId, title, kind: 'book' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    clear(article);
    article.append(errorState(err, () => render()));
  }
  return () => { document.body.classList.remove('reader-page', 'reader-paper'); };
});

/* ---------- shelf / history ---------- */

route('shelf', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  ctx.title('书架');
  const items = shelfItems();
  root.append(h('section', { class: 'page-head' },
    h('div', { class: 'grow' }, h('p', null, '收藏保存在这台设备上。')),
    items.length ? h('button', { class: 'act ghost small', type: 'button', onclick: clearShelf }, h('i', null, 'delete'), '清空') : null,
  ));
  if (!items.length) {
    root.append(emptyState({ icon: 'bookmarks', title: '书架还是空的', text: '在书籍详情页点「加入书架」，这里就会留下它。', action: h('a', { class: 'act primary', href: '#/' }, '去首页逛逛') }));
    return;
  }
  const list = h('div', { class: 'shelf-list' });
  for (const item of items) {
    const progress = progressOf(item.id);
    const row = h('div', { class: 'shelf-item' },
      h('a', { class: 'shelf-link', href: '#/book/' + item.id },
        h('div', { class: 'shelf-cover' }, image(item.cover, item.name), h('span', { class: 'cover-fallback' }, item.name || '书')),
        h('div', { class: 'shelf-meta' },
          h('strong', null, item.name || '未命名'),
          h('small', null, item.author || ''),
          progress ? h('span', { class: 'tag', style: { marginTop: '6px' } }, '读至 ' + progress.pct + '%') : null,
        ),
      ),
      h('button', {
        class: 'icon-btn', type: 'button', title: '移出书架', 'aria-label': '移出书架',
        onclick: () => { writeStore('shelf', shelfItems().filter((x) => x.id !== item.id)); row.remove(); toast('已移出书架'); if (!shelfItems().length) go('#/shelf', true); },
      }, h('i', null, 'close')),
    );
    list.append(row);
  }
  root.append(list);

  async function clearShelf() {
    if (!(await confirmDialog('清空书架？', '只删除本机的收藏记录，不影响账号。', '清空'))) return;
    writeStore('shelf', []);
    go('#/shelf', true);
    toast('书架已清空');
  }
});

route('history', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  ctx.title('足迹');
  const items = historyItems();
  root.append(h('section', { class: 'page-head' },
    h('div', { class: 'grow' }, h('p', null, '最近读过的书、看过的剧。')),
    items.length ? h('button', { class: 'act ghost small', type: 'button', onclick: async () => {
      if (!(await confirmDialog('清空足迹？', '只删除本机记录。', '清空'))) return;
      writeStore('history', []);
      go('#/history', true);
    } }, h('i', null, 'delete'), '清空') : null,
  ));
  if (!items.length) {
    root.append(emptyState({ icon: 'history', title: '还没有足迹', text: '读一章、看一集，这里会记住你停下的地方。' }));
    return;
  }
  const list = h('ul', { class: 'list' });
  for (const item of items) {
    const progress = progressOf(item.bookId);
    const href = item.kind === 'series' ? (item.itemId ? '#/watch/' + item.bookId + '/' + item.itemId : '#/series/' + item.bookId)
      : item.kind === 'manga' ? '#/manga/' + item.bookId + '/' + (item.itemId || '')
      : item.kind === 'audio' ? '#/audio/' + item.bookId
      : item.itemId ? '#/read/' + item.bookId + '/' + item.itemId : '#/book/' + item.bookId;
    list.append(h('li', null,
      h('a', { href, style: { display: 'flex', alignItems: 'center', gap: '12px', width: '100%' } },
        image(item.cover || '', item.title || ''),
        h('div', { class: 'max', style: { minWidth: 0 } },
          h('h6', { class: 'small' }, item.title || '未命名'),
          h('div', { class: 'tiny muted' }, [labelOf(item.kind), when(item.ts), progress && progress.pct ? '读至 ' + progress.pct + '%' : ''].filter(Boolean).join(' · ')),
        ),
        h('i', null, 'chevron_right'),
      ),
    ));
  }
  root.append(list);
});

/** @param {string} kind */
function labelOf(kind) {
  return kind === 'series' ? '短剧' : kind === 'manga' ? '漫画' : kind === 'audio' ? '听书' : '小说';
}

/* ---------- settings ---------- */

route('settings', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  ctx.title('设置');
  root.append(h('section', { class: 'page-head' }, h('div', { class: 'grow' },
    h('p', null, '服务器、令牌和阅读偏好。令牌与偏好只保存在这台设备。'),
  )));

  const grid = h('div', { class: 'settings-grid' });
  root.append(grid);

  /* server */
  const baseInput = h('input', { type: 'text', value: cfg.base, placeholder: ' ', spellcheck: 'false' });
  const tokenInput = h('input', { type: 'password', value: cfg.token, placeholder: ' ', spellcheck: 'false', autocomplete: 'off' });
  const status = h('div', { class: 'kv' }, h('span', null, '状态'), h('span', null, '未检测'));
  const serverCard = h('div', { class: 'card' },
    h('h2', null, '服务器'),
    h('p', { class: 'hint' }, '默认走当前页面同源的 Rust 反代（/api、/src）。也可以填 http://host:18921 直连。'),
    h('div', { class: 'field' }, baseInput, h('label', null, 'API 地址')),
    h('div', { class: 'field-hint' }, '留空 = 同源（推荐），也可以填 http://host:18921'),
    h('div', { class: 'field' }, tokenInput, h('label', null, '访问令牌')),
    h('div', { class: 'field-hint' }, '与后端 --token 一致，只保存在这台设备'),
    status,
    h('div', { class: 'chip-row', style: { marginTop: '14px' } },
      h('button', { class: 'act primary', type: 'button', onclick: saveServer }, h('i', null, 'save'), '保存'),
      h('button', { class: 'act tonal', type: 'button', onclick: testServer }, h('i', null, 'network_check'), '测试连接'),
      h('button', { class: 'act ghost', type: 'button', onclick: () => { tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password'; } }, h('i', null, 'visibility'), '显示令牌'),
    ),
  );

  /* appearance */
  const themeRow = h('div', { class: 'chip-row' },
    ['auto', 'light', 'dark'].map((/** @type {any} */ mode) => h('button', {
      class: 'chip' + (cfg.theme === mode ? ' active' : ''), type: 'button',
      onclick: () => { saveConfig({ theme: mode }); refreshThemeChips(); },
    }, mode === 'auto' ? '跟随系统' : mode === 'dark' ? '深色' : '浅色')),
  );
  const scale = h('input', { type: 'range', min: '0.85', max: '1.35', step: '0.05', value: String(cfg.scale), 'aria-label': '正文字号' });
  const line = h('input', { type: 'range', min: '1.6', max: '2.3', step: '0.1', value: String(cfg.line), 'aria-label': '行距' });
  const scaleOut = h('span', { class: 'range-value' }, Math.round(cfg.scale * 100) + '%');
  const lineOut = h('span', { class: 'range-value' }, cfg.line.toFixed(1));
  scale.addEventListener('input', () => { scaleOut.textContent = Math.round(Number(scale.value) * 100) + '%'; saveConfig({ scale: Number(scale.value) }); });
  line.addEventListener('input', () => { lineOut.textContent = Number(line.value).toFixed(1); saveConfig({ line: Number(line.value) }); });
  const lookCard = h('div', { class: 'card' },
    h('h2', null, '外观'),
    h('p', { class: 'hint' }, '亮暗双主题，番茄红作为唯一强调色；阅读器另有纸面设置。'),
    h('div', { class: 'setting-row' }, h('div', null, h('strong', null, '深浅色'), h('small', null, '可跟随系统')), themeRow),
    h('div', { class: 'setting-row' }, h('div', null, h('strong', null, '正文字号'), h('small', null, '阅读器默认')), h('div', { class: 'settings-range' }, scale, scaleOut)),
    h('div', { class: 'setting-row' }, h('div', null, h('strong', null, '行距'), h('small', null, '阅读器默认')), h('div', { class: 'settings-range' }, line, lineOut)),
  );

  /* shortcuts */
  const linkCard = h('div', { class: 'card' },
    h('h2', null, '更多'),
    h('p', { class: 'hint' }, '书旗书源、账号采集与接口调试。'),
    h('div', { class: 'chip-row' },
      h('a', { class: 'chip', href: '#/shuqi' }, h('i', null, 'storefront'), '书旗'),
      h('a', { class: 'chip', href: '#/account' }, h('i', null, 'key'), '账号采集'),
      h('a', { class: 'chip', href: '#/dev' }, h('i', null, 'terminal'), '接口实验室'),
    ),
    h('div', { style: { marginTop: '16px' } },
      h('div', { class: 'kv' }, h('span', null, '版本'), h('span', null, '番茄小站 tiny 0.1')),
      h('div', { class: 'kv' }, h('span', null, '前端'), h('span', null, 'Vanilla JS + Beer CSS')),
      h('div', { class: 'kv' }, h('span', null, '服务端'), h('span', null, location.host || '同源')),
    ),
  );

  /* data */
  const dataCard = h('div', { class: 'card' },
    h('h2', null, '本地数据'),
    h('p', { class: 'hint' }, '书架、足迹、阅读进度与偏好都只在这台设备，不上传。'),
    h('div', { class: 'setting-row' }, h('div', null, h('strong', null, '书架'), h('small', null, shelfItems().length + ' 本')), h('button', { class: 'act ghost small', type: 'button', onclick: () => { writeStore('shelf', []); toast('书架已清空'); } }, '清空')),
    h('div', { class: 'setting-row' }, h('div', null, h('strong', null, '足迹'), h('small', null, historyItems().length + ' 条')), h('button', { class: 'act ghost small', type: 'button', onclick: () => { writeStore('history', []); toast('足迹已清空'); } }, '清空')),
    h('div', { class: 'setting-row' }, h('div', null, h('strong', null, '阅读进度'), h('small', null, '按书记忆')), h('button', { class: 'act ghost small', type: 'button', onclick: () => { for (const key of Object.keys(localStorage)) if (key.startsWith('fq.progress.')) dropStore(key.slice(3)); toast('阅读进度已清空'); } }, '清空')),
  );

  grid.append(serverCard, lookCard, linkCard, dataCard);

  function refreshThemeChips() {
    Array.from(themeRow.children).forEach((node, index) => node.classList.toggle('active', ['auto', 'light', 'dark'][index] === cfg.theme));
  }

  function saveServer() {
    saveConfig({ base: baseInput.value.trim().replace(/\/+$/, ''), token: tokenInput.value.trim() });
    toast('设置已保存');
    refreshThemeChips();
  }

  async function testServer() {
    saveServer();
    status.replaceChildren(h('span', null, '状态'), h('span', null, '检测中…'));
    try {
      const result = await healthCheck();
      const text = result.ready === 200 ? '就绪 · ' + (result.devices || 0) + ' 个设备' : result.health === 200 ? '启动中 · 等待设备注册' : '离线';
      status.replaceChildren(h('span', null, '状态'), h('span', null, text));
      toast(text);
    } catch (err) {
      status.replaceChildren(h('span', null, '状态'), h('span', null, '离线：' + (msg(err) || '')));
      toast('连不上服务器', true);
    }
  }

  const initial = await healthCheck().catch(() => null);
  if (initial) status.replaceChildren(h('span', null, '状态'), h('span', null, initial.ready === 200 ? '就绪 · ' + (initial.devices || 0) + ' 个设备' : initial.health === 200 ? '启动中' : '离线'));
});

async function healthCheck() {
  const base = cfg.base ? cfg.base.replace(/\/+$/, '') : '';
  const get = async (/** @type {string} */ path) => {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(5000) });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  const [health, ready] = await Promise.all([get('/healthz'), get('/readyz')]);
  return { health: health.status, ready: ready.status, devices: ready.data && ready.data.devices };
}

/* ---------- account capture ---------- */

route('account', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  ctx.title('账号采集');
  const cookie = h('textarea', { rows: 4, placeholder: ' ', 'aria-label': 'Cookie' });
  const resource = h('input', { type: 'text', value: 'shelf', placeholder: ' ' });
  const offset = h('input', { type: 'number', value: '0', placeholder: ' ' });
  const result = h('div', { class: 'code-box', style: { marginTop: '14px' } }, '结果会显示在这里。');
  const target = cfg.base || location.host;

  async function guard() {
    return confirmDialog(
      '确定要发送 Cookie 吗？',
      'Cookie 会以 POST body 发送到 ' + target + '，由服务端转发给上游。它不会写进 URL、日志或设备池，但确实离开了这台设备。只在你自己的部署里使用。',
      '发送',
    );
  }

  async function library() {
    if (!cookie.value.trim()) { cookie.focus(); return; }
    if (!(await guard())) return;
    result.textContent = '请求中…';
    try {
      const data = await apiPost('/api/v1/account/fanqie/library', {}, { cookie: cookie.value.trim(), resource: resource.value.trim() || 'shelf' });
      result.textContent = JSON.stringify(data, null, 2).slice(0, 20000);
      toast('已返回书架数据');
    } catch (err) { result.textContent = '错误：' + (msg(err) || ''); toast(msg(err) || '请求失败', true); }
  }

  async function history() {
    if (!cookie.value.trim()) { cookie.focus(); return; }
    if (!(await guard())) return;
    result.textContent = '请求中…';
    try {
      const data = await apiPost('/api/v1/account/fanqie/history', {}, {
        cookie: cookie.value.trim(),
        offset: Number(offset.value) || 0,
        last_min_read_timestamp_ms: 0,
        is_first_load: true,
      });
      result.textContent = JSON.stringify(data, null, 2).slice(0, 20000);
      toast('已返回阅读历史');
    } catch (err) { result.textContent = '错误：' + (msg(err) || ''); toast(msg(err) || '请求失败', true); }
  }

  root.append(
    h('section', { class: 'page-head' }, h('div', { class: 'grow' }, h('p', null, '读取你自己的番茄书架与阅读历史。'))),
    h('div', { class: 'account-warn' },
      h('i', null, 'shield'),
      h('div', null, h('strong', null, '这是把账号 Cookie 交给服务器的操作。'), h('div', null, '本项目是远程服务：Cookie 会离开这台设备。入口默认放在这里而不是首页，就是希望你先看清这句话。Cookie 不写入 localStorage，刷新即失。')),
    ),
    h('div', { class: 'settings-grid', style: { marginTop: '16px' } },
      h('div', { class: 'card' },
        h('h2', null, '读取书架'),
        h('p', { class: 'hint' }, '服务端只会转发 9 个白名单只读 RPC。'),
        h('div', { class: 'field' }, cookie, h('label', null, 'Cookie')),
        h('div', { class: 'field' }, resource, h('label', null, 'resource')),
        h('div', { class: 'chip-row' }, h('button', { class: 'act primary', type: 'button', onclick: library }, h('i', null, 'menu_book'), '读取书架')),
      ),
      h('div', { class: 'card' },
        h('h2', null, '阅读历史'),
        h('p', { class: 'hint' }, '只读，不分页大小；offset 控制起点。'),
        h('div', { class: 'field' }, offset, h('label', null, 'offset')),
        h('div', { class: 'chip-row' }, h('button', { class: 'act tonal', type: 'button', onclick: history }, h('i', null, 'history'), '读取历史')),
        h('div', { class: 'tiny muted', style: { marginTop: '14px' } }, '结果原样展示上游 JSON。服务端不会把 Cookie 写进日志。'),
      ),
    ),
    result,
  );
});

/* ---------- dev console ---------- */

/** @type {{s:string,m:string,p:string,q?:string[],note?:string,body?:boolean}[]} */
const ENDPOINTS = [
  { s: '首页与推荐', m: 'GET', p: '/api/v1/recommend/homepage', q: ['tab_type', 'tab_index', 'offset', 'session_id'] },
  { s: '首页与推荐', m: 'GET', p: '/api/v1/recommend', q: ['tab_type', 'tab_index', 'offset'] },
  { s: '首页与推荐', m: 'GET', p: '/api/v1/recommend/channels', q: ['tab_type', 'last_tab_type'] },
  { s: '首页与推荐', m: 'GET', p: '/api/v1/recommend/series-feed', q: ['cell_id', 'tab_type', 'offset'] },
  { s: '首页与推荐', m: 'GET', p: '/api/v1/series/{series_id}/related' },
  { s: '搜索与分类', m: 'GET', p: '/api/v1/search', q: ['query', 'offset', 'count', 'tab_type'] },
  { s: '搜索与分类', m: 'GET', p: '/api/v1/search/fanqie', q: ['query', 'offset'] },
  { s: '搜索与分类', m: 'GET', p: '/api/v1/search/suggest', note: '未实现：404 unsupported api type' },
  { s: '搜索与分类', m: 'GET', p: '/api/v1/search/hot', q: ['show_type'] },
  { s: '搜索与分类', m: 'GET', p: '/api/v1/search/cue', q: ['cue_type', 'tab_type', 'tab_name'] },
  { s: '搜索与分类', m: 'GET', p: '/api/v1/category', q: ['category_tab'] },
  { s: '书籍', m: 'GET', p: '/api/v1/books/{book_id}' },
  { s: '书籍', m: 'GET', p: '/api/v1/books/{book_id}/detail' },
  { s: '书籍', m: 'GET', p: '/api/v1/books/{book_id}/directory', q: ['api_type'] },
  { s: '书籍', m: 'GET', p: '/api/v1/books/{book_id}/directory/novel' },
  { s: '书籍', m: 'GET', p: '/api/v1/books/{book_id}/directory/fanqie' },
  { s: '书籍', m: 'GET', p: '/api/v1/books/{book_id}/chapters/summary', q: ['item_ids'] },
  { s: '书籍', m: 'GET', p: '/api/v1/books/{book_id}/reviews', q: ['count', 'offset', 'fold_type'] },
  { s: '书籍', m: 'GET', p: '/api/v1/books/{book_id}/comments', q: ['count', 'offset'] },
  { s: '书籍', m: 'GET', p: '/api/v1/books/{book_id}/related' },
  { s: '书籍', m: 'GET', p: '/api/v1/books/{book_id}/tones' },
  { s: '书籍', m: 'GET', p: '/api/v1/books/{book_id}/share' },
  { s: '书籍', m: 'GET', p: '/api/v1/novels/{post_id}' },
  { s: '正文', m: 'GET', p: '/api/v1/chapters/{item_id}' },
  { s: '正文', m: 'GET', p: '/api/v1/chapters/batch', q: ['item_ids'] },
  { s: '正文', m: 'GET', p: '/api/v1/chapters/full', q: ['book_id', 'item_ids'] },
  { s: '正文', m: 'GET', p: '/api/v1/chapters/{item_id}/novel' },
  { s: '正文', m: 'GET', p: '/api/v1/chapters/{item_id}/toutiao' },
  { s: '正文', m: 'GET', p: '/api/v1/chapters/{item_id}/reviews', q: ['count', 'offset'] },
  { s: '正文', m: 'GET', p: '/api/v1/chapters/{item_id}/paragraphs/{n}/reviews', q: ['count', 'offset'] },
  { s: '正文', m: 'GET', p: '/api/v1/chapters/{item_id}/paragraphs/{n}/short-reviews', q: ['count', 'offset'] },
  { s: '正文', m: 'GET', p: '/api/v1/chapters/{item_id}/timeline' },
  { s: '正文', m: 'GET', p: '/api/v1/chapters/{item_id}/timepoints', q: ['book_id', 'tone_id', 'req_type'] },
  { s: '短剧', m: 'GET', p: '/api/v1/videos/{video_id}', q: ['mode'] },
  { s: '短剧', m: 'GET', p: '/api/v1/videos/{video_id}/detail' },
  { s: '短剧', m: 'GET', p: '/api/v1/videos/{video_id}/danmaku', q: ['series_id', 'start_offset_time', 'playlet_item_duration', 'cursor'] },
  { s: '短剧', m: 'POST', p: '/api/v1/videos/{video_id}/danmaku/add', q: ['text', 'series_id'] },
  { s: '短剧', m: 'GET', p: '/api/v1/series/{series_id}' },
  { s: '短剧', m: 'GET', p: '/api/v1/series/{series_id}/comments', q: ['count', 'offset'] },
  { s: '短剧', m: 'POST', p: '/api/v1/series/{series_id}/comments/add', q: ['text'] },
  { s: '短剧', m: 'GET', p: '/api/v1/series/{series_id}/comments/{comment_id}/replies' },
  { s: '短剧', m: 'GET', p: '/api/v1/series/{series_id}/hot-comments', q: ['vid'] },
  { s: '短剧', m: 'GET', p: '/api/v1/series/{series_id}/share' },
  { s: '评论', m: 'GET', p: '/api/v1/comments/{comment_id}/replies', q: ['group_id', 'book_id', 'count'] },
  { s: '评论', m: 'POST', p: '/api/v1/comments/{comment_id}/digg', q: ['series_id'] },
  { s: '评论', m: 'POST', p: '/api/v1/comments/{comment_id}/reply', q: ['text', 'series_id', 'reply_to_comment_id', 'reply_to_reply_id', 'reply_to_user_id'] },
  { s: '评论', m: 'GET', p: '/api/v1/comments/short-url', q: ['target'] },
  { s: '漫画', m: 'GET', p: '/api/v1/manga/{item_ids}', q: ['api_type', 'book_id', 'show_html'] },
  { s: '漫画', m: 'GET', p: '/api/v1/manga/videos/{pseries_id}', q: ['offset', 'count', 'total', 'pseries_type'] },
  { s: '听书', m: 'GET', p: '/api/v1/audio/books/{book_id}' },
  { s: '听书', m: 'GET', p: '/api/v1/audio/books/{book_id}/chapters/{chapter_id}' },
  { s: '听书', m: 'GET', p: '/api/v1/audio/play', q: ['item_ids', 'book_id', 'tone_id'] },
  { s: '听书', m: 'GET', p: '/api/v1/audio/wkcontent/{item_ids}', q: ['genre', 'tone_id'] },
  { s: '作者与榜单', m: 'GET', p: '/api/v1/authors/{author_id}' },
  { s: '作者与榜单', m: 'GET', p: '/api/v1/authors/{author_id}/bookshelf', q: ['count', 'offset'] },
  { s: '作者与榜单', m: 'GET', p: '/api/v1/rank/{rank_id}', q: ['algo_type', 'genre_tab', 'offset', 'count', 'rank_sub_info_id'] },
  { s: '其它', m: 'GET', p: '/api/v1/items/{item_ids}' },
  { s: '其它', m: 'GET', p: '/api/v1/articles/{item_ids}', note: '未实现：404 unsupported api type' },
  { s: '其它', m: 'GET', p: '/api/v1/forum-id', q: ['author_user_id', 'book_id', 'item_id'] },
  { s: '书旗', m: 'GET', p: '/api/v1/shuqi/search', q: ['key'] },
  { s: '书旗', m: 'GET', p: '/api/v1/shuqi/book', q: ['book_id'] },
  { s: '书旗', m: 'GET', p: '/api/v1/shuqi/toc', q: ['book_id'] },
  { s: '书旗', m: 'GET', p: '/api/v1/shuqi/chapter', q: ['book_id', 'chapter_id'] },
  { s: '账号采集', m: 'POST', p: '/api/v1/account/fanqie/library', body: true, q: ['cookie', 'resource'] },
  { s: '账号采集', m: 'POST', p: '/api/v1/account/fanqie/history', body: true, q: ['cookie', 'offset'] },
  { s: '健康检查', m: 'GET', p: '/healthz' },
  { s: '健康检查', m: 'GET', p: '/readyz' },
];

route('dev', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  ctx.title('接口实验室');
  root.append(h('section', { class: 'page-head' },
    h('div', { class: 'grow' }, h('p', null, '全部 51 个端点、65 条路径的直达入口。响应原样展示，包括 404 死路由。')),
    h('span', { class: 'tag' }, ENDPOINTS.length + ' 条'),
  ));
  const wrap = h('div', { class: 'dev-list' });
  root.append(wrap);

  const sections = new Map();
  for (const ep of ENDPOINTS) {
    if (!sections.has(ep.s)) sections.set(ep.s, []);
    sections.get(ep.s).push(ep);
  }
  for (const [section, list] of sections) {
    wrap.append(h('h2', { class: 'section-head', style: { marginTop: '22px' } }, section));
    for (const ep of list) wrap.append(devItem(ep));
  }
});

/** @param {any} ep */
function devItem(ep) {
  const placeholders = Array.from(ep.p.matchAll(/\{(\w+)\}/g)).map((/** @type {any} */ match) => match[1]);
  /** @type {Record<string, HTMLInputElement>} */
  const fields = {};
  const inputs = h('div', { class: 'row' });
  for (const key of placeholders) {
    const input = h('input', { type: 'text', placeholder: ' ', 'aria-label': key });
    fields[key] = input;
    inputs.append(h('div', { class: 'field' }, input, h('label', null, key)));
  }
  for (const key of (ep.q || []).filter((/** @type {any} */ key) => !placeholders.includes(key))) {
    const input = h('input', { type: 'text', placeholder: ' ', 'aria-label': key });
    fields[key] = input;
    inputs.append(h('div', { class: 'field' }, input, h('label', null, key)));
  }
  const out = h('div', { class: 'result' });
  const body = h('div', { class: 'dev-body' }, inputs,
    h('div', { class: 'chip-row' },
      h('button', { class: 'act primary small', type: 'button', onclick: send }, h('i', null, 'send'), '发送'),
      ep.note ? h('span', { class: 'tag' }, ep.note) : null,
    ),
    out,
  );
  const node = h('details', { class: 'dev-item' },
    h('summary', null,
      h('span', { class: 'method' }, ep.m),
      h('code', null, ep.p),
      ep.note ? h('span', { class: 'badge-404' }, '404') : null,
    ),
    body,
  );

  async function send() {
    const path = ep.p.replace(/\{(\w+)\}/g, (/** @type {any} */ _, /** @type {any} */ key) => encodeURIComponent(fields[key] ? fields[key].value.trim() : ''));
    /** @type {Record<string,string>} */
    const query = {};
    for (const key of (ep.q || [])) if (fields[key] && fields[key].value.trim()) query[key] = fields[key].value.trim();
    const started = performance.now();
    clear(out).append(h('div', { class: 'result-head' }, '请求中…'));
    try {
      let data;
      if (ep.body) {
        /** @type {Record<string,string>} */
        const payload = {};
        for (const key of ep.q || []) if (query[key]) payload[key] = query[key];
        data = await apiPost(path, {}, payload);
      } else if (ep.m === 'POST') {
        data = await apiPost(path, query);
      } else if (path === '/healthz' || path === '/readyz') {
        const res = await fetch((cfg.base || '') + path);
        data = await res.json().catch(() => ({}));
        const ms = Math.round(performance.now() - started);
        clear(out);
        out.append(h('div', { class: 'result-head' }, h('span', { class: 'ok' }, 'HTTP ' + res.status), h('span', null, ms + ' ms')));
        out.append(h('div', { class: 'code-box' }, JSON.stringify(data, null, 2).slice(0, 30000)));
        return;
      } else {
        data = await api(path, query);
      }
      const ms = Math.round(performance.now() - started);
      clear(out);
      out.append(h('div', { class: 'result-head' }, h('span', { class: 'ok' }, 'code ' + (data.code ?? 0)), h('span', null, ms + ' ms'), h('button', { class: 'icon-btn', type: 'button', title: '复制 JSON', onclick: () => copy(JSON.stringify(data, null, 2)) }, h('i', null, 'content_copy'))));
      out.append(h('div', { class: 'code-box' }, JSON.stringify(data, null, 2).slice(0, 30000)));
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      const e = /** @type {any} */ (err);
      clear(out);
      out.append(h('div', { class: 'result-head' }, h('span', { class: 'bad' }, (e.status ? 'HTTP ' + e.status + ' · ' : '') + (e.code ? 'code ' + e.code : '错误')), h('span', null, ms + ' ms')));
      out.append(h('div', { class: 'code-box' }, msg(err) || String(err)));
    }
  }

  return node;
}

/* ---------- long review post ---------- */

route('post', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  const id = ctx.params[0] || '';
  ctx.title('长评');
  const body = h('div', null, loadingShelf(2));
  root.append(body);
  try {
    const data = await api('/api/v1/novels/' + id, {}, { signal: ctx.signal });
    const payload = data.data || {};
    clear(body);
    body.append(h('section', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, payload.title || payload.post_title || '长评'), h('p', null, payload.user_name || payload.author || ''))));
    const text = payload.content || payload.text || payload.abstract;
    if (text) body.append(h('article', { class: 'reader', style: { margin: '0 auto' } }, String(text).split(/\n+/).filter(Boolean).map((/** @type {any} */ line) => h('p', null, line))));
    else body.append(h('div', { class: 'code-box' }, JSON.stringify(payload, null, 2)));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    clear(body);
    body.append(errorState(err, () => render()));
  }
});
