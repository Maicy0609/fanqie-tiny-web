// 首页、搜索、分类、书籍详情、阅读器
import {
  api, msg, h, clear, qs, route, go, render, bookOf, seriesOf, commentOf, commentView, commentList, seriesRow,
  paragraphsOf, shelf, bookCard, seriesCard, image, emptyState, errorState,
  loadingShelf, toast, openDialog, openSheet, num, words, trim, safeColor, readStore, writeStore,
  inShelf, toggleShelf, pushHistory, progressOf, saveProgress, cfg, saveConfig, copy,
} from './core.js';

/* ---------- shared ---------- */

/** @param {any[]} books @param {string} [cls] */
function bookGrid(books, cls = 'grid-books') {
  return h('div', { class: cls }, books.map((/** @type {any} */ book) => bookCard(book)));
}

/**
 * @param {any[]} items
 * @returns {{rawBooks:any[],rawSeries:any[],books:any[],series:any[]}}
 */
function itemsContent(items) {
  const books = [];
  const series = [];
  for (const item of items || []) {
    if (Array.isArray(item.book_data) && item.book_data.length) books.push(...item.book_data);
    if (Array.isArray(item.video_data) && item.video_data.length) series.push(...item.video_data);
    if (!item.book_data && !item.video_data && item.book_id) books.push(item);
    if (Array.isArray(item.cell_data) && item.cell_data.length) {
      const nested = itemsContent(item.cell_data);
      books.push(...nested.rawBooks);
      series.push(...nested.rawSeries);
    }
  }
  return { rawBooks: books, rawSeries: series, books: books.map(bookOf).filter((/** @type {any} */ b) => b.id), series: series.map(seriesOf).filter((/** @type {any} */ s) => s.id) };
}

/** @param {any[]} cells @returns {ReturnType<typeof itemsContent>} */
function cellContent(cells) {
  const all = [];
  for (const cell of cells || []) if (Array.isArray(cell.cell_data)) all.push(...cell.cell_data);
  return itemsContent(all);
}

/** @param {any} book @param {string} [size] */
function coverBox(book, size = '') {
  return h('div', { class: 'detail-cover ' + size }, image(book.cover, book.name), h('span', { class: 'cover-fallback' }, book.name));
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

/* ---------- home ---------- */

route('home', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  ctx.title('首页');
  root.append(h('section', { class: 'page-head' },
    h('div', { class: 'grow' },
      h('h1', null, greeting()),
      h('p', null, '把故事读到最后一页。今天想读点什么？') ),
  ));

  const tabsHost = h('div', { class: 'tabs-line home-tabs', role: 'tablist', 'aria-label': '内容频道' });
  const body = h('div', null, loadingShelf());
  root.append(tabsHost, body);

  /** @type {any[]} */
  let tabs = [];
  let active = Number(sessionStorage.getItem('fq.home.tab') || 0);
  let loading = false;

  /** @param {any} tabItem */
  const renderTab = (tabItem) => {
    clear(body);
    const cells = tabItem.cell_data || [];
    if (!cells.length) {
      body.append(emptyState({ icon: 'auto_stories', title: '这个频道暂时没有内容', text: '换一个频道看看，或稍后回来。' }));
      return;
    }
    const first = cellContent([cells[0]]);
    const heroBook = first.books[0];
    if (heroBook) body.append(hero(heroBook));

    for (const cell of cells) {
      const content = cellContent([cell]);
      if (!content.books.length && !content.series.length) continue;
      const title = cell.cell_name || cell.cell_alias || '为你推荐';
      if (content.series.length) {
        body.append(shelf(title || '正在热播', content.series.slice(0, 12).map(seriesCard)));
        continue;
      }
      if (/排行榜|榜$/.test(title) && content.books.length >= 6) {
        body.append(h('section', { class: 'shelf' },
          h('div', { class: 'section-head' }, h('h2', null, title), h('span', null, cell.cell_alias || '实时热度')),
          rankGrid(content.books.slice(0, 12)),
        ));
        continue;
      }
      body.append(shelf(title || '猜你喜欢', content.books.slice(0, 16).map((/** @type {any} */ book) => bookCard(book))));
    }

    if (tabItem.has_more) {
      body.append(h('div', { class: 'toc-more' },
        h('button', { class: 'act tonal', type: 'button', onclick: () => loadTab(activeTab(), Number(tabItem.next_offset) || 0, true) },
          h('i', null, 'refresh'), '换一批'),
      ));
    }
  };

  /** @param {any} book @returns {any} */
  const hero = (book) => {
    const chapter = book.raw && book.raw.first_chapter_item_id;
    return h('section', { class: 'hero', style: { '--tint': safeColor(book.color) } },
      h('div', { class: 'hero-copy' },
        h('div', { class: 'hero-kicker' }, '今日主推'),
        h('h1', null, book.name),
        h('div', { class: 'hero-meta' },
          book.author ? h('span', null, book.author) : null,
          book.category ? h('span', null, book.category) : null,
          book.score ? h('span', null, '★ ' + book.score) : null,
          book.readText ? h('span', null, book.readText) : null,
          book.chapters ? h('span', null, book.chapters + ' 章') : null,
        ),
        h('p', null, trim(book.abstract, 150)),
        h('div', { class: 'hero-actions' },
          chapter
            ? h('a', { class: 'act primary', href: '#/read/' + book.id + '/' + chapter }, h('i', null, 'play_arrow'), '开始阅读')
            : h('a', { class: 'act primary', href: '#/book/' + book.id }, h('i', null, 'menu_book'), '查看详情'),
          h('a', { class: 'act text', href: '#/book/' + book.id }, '查看详情', h('i', null, 'chevron_right')),
        ),
      ),
      h('a', { class: 'hero-cover', href: '#/book/' + book.id, 'aria-label': book.name }, image(book.cover, book.name), h('span', { class: 'cover-fallback' }, book.name)),
    );
  };

  /** @param {number} type */
  const activeTab = (type = active) => tabs.find((/** @type {any} */ tab) => Number(tab.tab_type) === Number(type)) || tabs[0];

  /** @param {any} tab @param {number} offset @param {boolean} [replace] */
  async function loadTab(tab, offset = 0, replace = false) {
    if (!tab || loading) return;
    loading = true;
    if (!replace) clear(body).append(loadingShelf());
    try {
      const index = tabs.indexOf(tab);
      const data = await api('/api/v1/recommend/homepage', {
        tab_type: tab.tab_type, tab_index: index, offset,
        session_id: sessionStorage.getItem('fq.home.sid') || '',
      }, { signal: ctx.signal, timeout: 90000 });
      const sid = data && data.data && data.data.tab_item && data.data.tab_item[0] && data.data.tab_item[0].session_id;
      if (sid) sessionStorage.setItem('fq.home.sid', sid);
      const fresh = (data.data.tab_item || []).find((/** @type {any} */ item) => Number(item.tab_type) === Number(tab.tab_type)) || tab;
      if (replace && fresh.cell_data) {
        clear(body);
        const heroBook = cellContent([fresh.cell_data[0]]).books[0];
        if (heroBook) body.append(hero(heroBook));
        for (const cell of fresh.cell_data) {
          const content = cellContent([cell]);
          if (!content.books.length && !content.series.length) continue;
          const title = cell.cell_name || cell.cell_alias || '为你推荐';
          if (content.series.length) body.append(shelf(title, content.series.slice(0, 12).map(seriesCard)));
          else if (/排行榜|榜$/.test(title) && content.books.length >= 6) body.append(h('section', { class: 'shelf' }, h('div', { class: 'section-head' }, h('h2', null, title), h('span', null, cell.cell_alias || '')), rankGrid(content.books.slice(0, 12))));
          else body.append(shelf(title, content.books.slice(0, 16).map((/** @type {any} */ book) => bookCard(book))));
        }
        if (fresh.has_more) body.append(h('div', { class: 'toc-more' }, h('button', { class: 'act tonal', type: 'button', onclick: () => loadTab(fresh, Number(fresh.next_offset) || 0, true) }, h('i', null, 'refresh'), '换一批')));
      } else {
        renderTab(fresh);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      clear(body);
      body.append(errorState(err, () => loadTab(tab, offset, replace)));
    } finally {
      loading = false;
    }
  }

  try {
    const data = await api('/api/v1/recommend/homepage', { tab_type: 2, tab_index: 0, offset: 0 }, { signal: ctx.signal, timeout: 90000 });
    tabs = (data.data && data.data.tab_item) || [];
    if (!tabs.length) throw new Error('首页没有返回任何频道');
    const sid = tabs[0].session_id;
    if (sid) sessionStorage.setItem('fq.home.sid', sid);
    const wanted = ['推荐', '小说', '听书', '看剧', '漫画', '短篇'];
    const visible = wanted.map((title) => tabs.find((tab) => tab.title === title)).filter(Boolean);
    const base = visible.length >= 3 ? visible : tabs.slice(0, 6);
    const requested = ctx.query.get('tab');
    const requestedTab = requested ? tabs.find((tab) => tab.title === requested) : null;
    const chosen = requestedTab || base.find((tab) => Number(tab.tab_type) === Number(active)) || base[0];
    const picked = base.includes(chosen) ? base : [chosen, ...base];
    active = Number(chosen.tab_type);
    /** @param {HTMLElement|null} button */
    const center = (button) => {
      if (!button) return;
      const left = button.offsetLeft - tabsHost.offsetLeft - (tabsHost.clientWidth - button.offsetWidth) / 2;
      tabsHost.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    };
    let activeButton = null;
    for (const tab of picked) {
      const button = h('button', {
        class: 'tab' + (Number(tab.tab_type) === active ? ' active' : ''),
        type: 'button', role: 'tab',
        'aria-selected': Number(tab.tab_type) === active ? 'true' : 'false',
        onclick: () => {
          active = Number(tab.tab_type);
          sessionStorage.setItem('fq.home.tab', String(active));
          for (const node of tabsHost.children) {
            node.classList.toggle('active', node === button);
            node.setAttribute('aria-selected', node === button ? 'true' : 'false');
          }
          center(button);
          const target = activeTab(active);
          if (target.cell_data && target.cell_data.length) renderTab(target);
          else loadTab(target, 0);
        },
      }, tab.title || '频道');
      if (Number(tab.tab_type) === active) activeButton = button;
      tabsHost.append(button);
    }
    requestAnimationFrame(() => center(activeButton));
    if (chosen.cell_data && chosen.cell_data.length) renderTab(chosen);
    else await loadTab(chosen, 0);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    clear(body);
    body.append(errorState(err, () => render()));
  }
});

/** @param {any[]} books */
function rankGrid(books) {
  const wrap = h('div', { class: 'rank-grid' });
  books.forEach((book, index) => {
    wrap.append(h('a', { class: 'rank-item', href: '#/book/' + book.id },
      h('div', { class: 'idx' }, index + 1),
      h('div', { class: 'rank-thumb' }, image(book.cover, book.name), h('span', { class: 'shot-fallback' }, (book.name || '书').slice(0, 1))),
      h('div', { class: 'r-meta' },
        h('strong', null, book.name),
        h('small', null, [book.author, book.readText].filter(Boolean).join(' · ')),
      ),
    ));
  });
  return wrap;
}

/* ---------- search ---------- */

route('search', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  const q = (ctx.query.get('q') || '').trim();
  ctx.title('搜索');
  const head = h('section', { class: 'search-head' },
    h('p', null, q ? '“' + q + '” 的搜索结果' : '书名、作者、角色，甚至一句台词。'),
  );
  const form = h('form', { class: 'search-big', role: 'search' },
    h('i', null, 'search'),
    h('input', { type: 'search', value: q, placeholder: '试试「剑来」或「赘婿」', 'aria-label': '搜索关键词', autofocus: !q }),
    h('button', { class: 'act primary', type: 'submit' }, '搜索'),
  );
  form.addEventListener('submit', (/** @type {any} */ event) => {
    event.preventDefault();
    const input = qs('input', form);
    const value = input.value.trim();
    if (!value) { input.focus(); return; }
    rememberSearch(value);
    go('#/search?q=' + encodeURIComponent(value));
  });
  root.append(head, form);

  if (!q) { await landing(root, ctx); return; }

  rememberSearch(q);
  const tabsHost = h('div', { class: 'tabs-line result-tabs', role: 'tablist' });
  const summary = h('div', { class: 'result-summary' });
  const body = h('div', null, loadingShelf());
  root.append(tabsHost, summary, body);

  let active = Number(sessionStorage.getItem('fq.search.tab') || 1);
  /** @type {any[]} */
  let tabs = [];
  let loading = false;

  /** @param {any} tab @param {boolean} [append] */
  const renderTab = (tab, append = false) => {
    const { books, series } = itemsContent(tab.data || []);
    if (!append) clear(body);
    if (!books.length && !series.length) {
      if (!append) body.append(emptyState({ icon: 'search_off', title: '没有找到结果', text: '换个关键词，或试试其他分类。', action: h('button', { class: 'act tonal', type: 'button', onclick: () => go('#/search') }, '返回搜索') }));
      return;
    }
    if (series.length) body.append(h('section', { class: 'shelf' }, h('div', { class: 'section-head' }, h('h2', null, '相关短剧'), h('span', null, series.length + ' 部')), h('div', { class: 'series-list' }, series.map(seriesRow))));
    if (books.length) body.append(h('section', { class: 'shelf' }, h('div', { class: 'section-head' }, h('h2', null, '相关作品'), h('span', null, books.length + ' 本')), bookGrid(books)));
    if (tab.has_more) {
      body.append(h('div', { class: 'toc-more' }, h('button', { class: 'act tonal', type: 'button', onclick: () => load(active, true) }, h('i', null, 'expand_more'), '加载更多')));
    }
  };

  /** @param {any} type @param {boolean} [append] */
  async function load(type, append = false) {
    if (loading) return;
    loading = true;
    if (!append) clear(body).append(loadingShelf());
    try {
      const offset = append ? (tabs.find((/** @type {any} */ t) => Number(t.tab_type) === Number(type)) || {}).data?.length || 0 : 0;
      const data = await api('/api/v1/search', { query: q, tab_type: type, offset, count: 10 }, { signal: ctx.signal });
      tabs = data.search_tabs || [];
      const tab = tabs.find((/** @type {any} */ item) => Number(item.tab_type) === Number(type)) || tabs[0];
      if (!tab) throw new Error('搜索没有返回结果');
      active = Number(tab.tab_type);
      renderTabs();
      summary.replaceChildren(h('i', null, 'travel_explore'), '共 ' + tabs.reduce((/** @type {any} */ sum, /** @type {any} */ t) => sum + ((t.data && t.data.length) || 0), 0) + ' 条结果');
      renderTab(tab, append);
      const alt = h('button', { class: 'act text small', type: 'button', onclick: () => loadFanqie(q, body) }, '备用搜索源', h('i', null, 'chevron_right'));
      summary.append(alt);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!append) { clear(body); body.append(errorState(err, () => load(type, append))); }
      else toast(msg(err) || '加载更多失败', true);
    } finally {
      loading = false;
    }
  }

  function renderTabs() {
    clear(tabsHost);
    for (const tab of tabs) {
      if (!tab.data || !tab.data.length) continue;
      tabsHost.append(h('button', {
        class: 'tab' + (Number(tab.tab_type) === active ? ' active' : ''), type: 'button', role: 'tab',
        onclick: () => { active = Number(tab.tab_type); sessionStorage.setItem('fq.search.tab', String(active)); load(active); },
      }, tab.title || '综合'));
    }
  }

  await load(active);
});

/** @param {string} value */
function rememberSearch(value) {
  const list = readStore('searches', []);
  const next = [value, ...(Array.isArray(list) ? list : []).filter((/** @type {any} */ item) => item !== value)].slice(0, 12);
  writeStore('searches', next);
}

/** @param {HTMLElement} root @param {any} ctx */
async function landing(root, ctx) {
  const wrap = h('div', null);
  root.append(wrap);
  const hotRow = h('section', { class: 'shelf' }, h('div', { class: 'section-head' }, h('h2', null, '番茄热搜'), h('span', null, '实时')), h('div', { class: 'hot-list' }, h('div', { class: 'skeleton sk-line', style: { width: '100%', height: '160px' } })));
  const history = readStore('searches', []);
  if (history.length) {
    wrap.append(h('section', { class: 'shelf' },
      h('div', { class: 'section-head' }, h('h2', null, '最近搜索'), h('button', { class: 'chip', type: 'button', onclick: () => { writeStore('searches', []); wrap.replaceChildren(); landing(root, ctx); } }, '清空')),
      h('div', { class: 'chip-row' }, history.map((/** @type {any} */ word) => h('a', { class: 'chip', href: '#/search?q=' + encodeURIComponent(word) }, word))),
    ));
  }
  wrap.append(hotRow);
  try {
    const [hot, cue] = await Promise.all([
      api('/api/v1/search/hot', {}, { signal: ctx.signal }),
      api('/api/v1/search/cue', {}, { signal: ctx.signal }).catch(() => null),
    ]);
    const tags = (hot.data && hot.data[0] && hot.data[0].search_tag_data) || [];
    clear(hotRow);
    hotRow.append(
      h('div', { class: 'section-head' }, h('h2', null, '番茄热搜'), h('span', null, (hot.data[0] && hot.data[0].cell_alias) || '实时')),
      h('div', { class: 'hot-list' }, tags.slice(0, 20).map((/** @type {any} */ tag, /** @type {any} */ index) => h('a', { class: 'hot-item', href: '#/search?q=' + encodeURIComponent(tag.tag_title) },
        h('span', { class: 'idx' }, index + 1),
        h('span', { class: 'max', style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, tag.tag_title),
        h('span', { class: 'tag' }, trim(tag.recommend_info || '', 10)),
      ))),
    );
    if (cue && cue.data_v1 && cue.data_v1.length) {
      const words = cue.data_v1.map((/** @type {any} */ item) => item.text).filter(Boolean);
      const input = qs('.search-big input');
      if (input && words.length) {
        let cursor = 0;
        input.placeholder = '试试「' + words[0] + '」';
        const timer = setInterval(() => {
          if (!document.body.contains(input)) { clearInterval(timer); return; }
          cursor = (cursor + 1) % words.length;
          input.placeholder = '试试「' + words[cursor] + '」';
        }, 3600);
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    clear(hotRow);
    hotRow.append(errorState(err, () => { wrap.replaceChildren(); landing(root, ctx); }));
  }
}

/** @param {string} q @param {HTMLElement} body */
async function loadFanqie(q, body) {
  clear(body).append(loadingShelf());
  try {
    const data = await api('/api/v1/search/fanqie', { query: q });
    const books = (data.data && data.data.ret_data || []).map(bookOf).filter((/** @type {any} */ b) => b.id);
    clear(body);
    body.append(h('section', { class: 'shelf' },
      h('div', { class: 'section-head' }, h('h2', null, '备用源结果'), h('span', null, '番茄书城')),
      books.length ? bookGrid(books) : emptyState({ icon: 'search_off', title: '备用源没有结果' }),
    ));
  } catch (err) {
    clear(body);
    body.append(errorState(err, () => loadFanqie(q, body)));
  }
}

/* ---------- category ---------- */

route('category', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  ctx.title('发现');
  let tab = Number(sessionStorage.getItem('fq.category.tab') || 1);
  const head = h('section', { class: 'page-head' },
    h('div', { class: 'grow' }, h('p', null, '按频道和题材，找到下一本让你熬夜的书。')),
  );
  const tabs = h('div', { class: 'chip-row' },
    h('button', { class: 'chip active', type: 'button', onclick: () => set(1) }, '男频'),
    h('button', { class: 'chip', type: 'button', onclick: () => set(2) }, '女频'),
  );
  const more = h('div', { class: 'chip-row' },
    ['经典', '知识', '新书', '商城', '视频'].map((title) => h('a', { class: 'chip', href: '#/?tab=' + encodeURIComponent(title) }, title)),
  );
  const grid = h('div', { class: 'category-grid' });
  root.append(head, tabs, h('div', { class: 'shelf' }, h('div', { class: 'section-head' }, h('h2', null, '更多频道'), h('span', null, '首页栏目')), more), h('div', { class: 'shelf' }, h('div', { class: 'section-head' }, h('h2', null, '全部题材')), grid));

  /** @param {number} next */
  async function set(next) {
    tab = next;
    sessionStorage.setItem('fq.category.tab', String(next));
    Array.from(tabs.children).forEach((node, index) => node.classList.toggle('active', index + 1 === next));
    clear(grid);
    for (let i = 0; i < 12; i += 1) grid.append(h('div', { class: 'skeleton', style: { height: '96px', borderRadius: '20px' } }));
    try {
      const data = await api('/api/v1/category', { category_tab: next }, { signal: ctx.signal });
      const list = (data.data && data.data.down_category) || [];
      clear(grid);
      for (const item of list) {
        grid.append(h('a', { class: 'category-tile', href: '#/search?q=' + encodeURIComponent(item.name) },
          item.cover ? image(item.cover, '') : null,
          h('strong', null, item.name || '未命名'),
          h('span', null, item.book_num ? item.book_num + ' 本' : ''),
        ));
      }
      if (!list.length) grid.append(emptyState({ icon: 'grid_view', title: '没有分类数据' }));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      clear(grid);
      grid.append(errorState(err, () => set(next)));
    }
  }
  await set(tab);
});

/* ---------- book detail ---------- */

route('book', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  const id = ctx.params[0] || '';
  ctx.title('书籍');
  const shell = h('div', null, loadingShelf(4));
  root.append(shell);

  /** @type {any} */
  let detail = null;
  let book = /** @type {any} */ (null);
  let panel = ['about', 'toc', 'reviews', 'comments', 'related'].includes(ctx.params[1] || '') ? ctx.params[1] : 'about';
  /** @type {any[]|null} */
  let directory = null;
  let shown = 0;
  const panels = h('div', { class: 'panel' });
  const tabRow = h('div', { class: 'tabs-line detail-tabs' });

  const firstItem = () => (book && book.first) || (detail && detail.first_chapter_item_id) || '';
  const progress = () => progressOf(id);

  const readHref = () => {
    const saved = progress();
    const item = (saved && saved.itemId) || firstItem();
    return item ? '#/read/' + id + '/' + item : '#/book/' + id;
  };

  function renderHero() {
    const saved = progress();
    const status = Number(book.status) === 1 ? '已完结' : '连载中';
    return h('section', { class: 'detail-panel', style: { '--tint': safeColor(book.color) } },
      coverBox(book),
      h('div', { class: 'detail-main' },
        h('h1', null, book.name),
        book.authorId
          ? h('a', { class: 'detail-author', href: '#/author/' + encodeURIComponent(String(book.authorId)) }, h('i', null, 'person'), book.author || '佚名')
          : h('span', { class: 'detail-author' }, h('i', null, 'person'), book.author || '佚名'),
        h('div', { class: 'detail-stats' },
          book.score ? h('span', null, h('b', null, book.score), ' 分') : null,
          book.readText ? h('span', null, book.readText) : null,
          book.words ? h('span', null, words(book.words)) : null,
          book.chapters ? h('span', null, book.chapters + ' 章') : null,
          h('span', null, status),
        ),
        h('div', { class: 'detail-actions' },
          h('a', { class: 'act primary', href: readHref() }, saved ? '继续阅读' : '开始阅读'),
          h('button', { class: 'act tonal', type: 'button', onclick: onShelf }, inShelf(book) ? '已在书架' : '加入书架'),
          h('div', { class: 'detail-icons' },
            h('a', { class: 'act ghost', href: '#/audio/' + id, title: '听书', 'aria-label': '听书' }, h('i', null, 'headphones')),
            h('button', { class: 'act ghost', type: 'button', title: '分享', 'aria-label': '分享', onclick: share }, h('i', null, 'share')),
            detail.forum_id && detail.author_id ? h('button', { class: 'act ghost', type: 'button', title: '圈子', 'aria-label': '圈子', onclick: forum }, h('i', null, 'groups')) : null,
          ),
        ),
      ),
    );
  }

  function onShelf() {
    const added = toggleShelf(book);
    toast(added ? '已加入书架' : '已移出书架');
    const hero = qs('.detail-panel', shell);
    if (hero) hero.replaceWith(renderHero());
  }

  async function forum() {
    try {
      const data = await api('/api/v1/forum-id', {
        author_user_id: detail.author_id,
        book_id: id,
        item_id: detail.first_chapter_item_id || '',
      });
      const forumId = data.data && (data.data.forum_id || data.data.id);
      await openDialog({
        title: '书友圈子',
        body: h('div', null, h('p', null, '上游返回的圈子标识：'), h('div', { class: 'code-box' }, String(forumId || JSON.stringify(data.data)))),
        actions: [{ label: '关闭', value: '' }],
      });
    } catch (err) { toast(msg(err) || '圈子信息不可用', true); }
  }

  async function share() {
    try {
      const data = await api('/api/v1/books/' + id + '/share');
      const link = data.data && (data.data.share_url || data.data.detail_opt_share_url || data.data.schema);
      if (!link) throw new Error('没有分享链接');
      await openDialog({
        title: '分享《' + book.name + '》',
        body: h('div', null,
          h('p', null, data.data.text || '把这本书分享给朋友'),
          h('div', { class: 'code-box' }, link),
        ),
        actions: [{ label: '关闭', value: '' }, { label: '复制链接', value: 'copy', primary: true }],
      }).then((value) => { if (value === 'copy') copy(String(link)); });
    } catch (err) { toast(msg(err) || '分享失败', true); }
  }

  function renderTabs() {
    clear(tabRow);
    for (const [key, label] of [['about', '简介'], ['toc', '目录'], ['reviews', '书评'], ['comments', '点评'], ['related', '相关']]) {
      tabRow.append(h('button', {
        class: 'tab' + (panel === key ? ' active' : ''), type: 'button',
        onclick: () => { panel = key; renderTabs(); drawPanel(); },
      }, label));
    }
  }

  async function drawPanel() {
    clear(panels);
    if (panel === 'about') return drawAbout();
    if (panel === 'toc') return drawToc();
    if (panel === 'reviews') return drawReviews();
    if (panel === 'comments') return drawComments();
    if (panel === 'related') return drawRelated();
  }

  function drawAbout() {
    panels.append(h('div', { class: 'prose' }, book.abstract || '这本书还没有简介。'));
    if (book.tags.length) {
      panels.append(h('div', { class: 'tag-row' }, book.tags.map((/** @type {any} */ tag) => h('span', { class: 'tag' }, tag))));
    }
    if (book.lastChapter) {
      panels.append(h('div', { class: 'muted tiny', style: { marginTop: '14px' } }, '最近更新 · ' + book.lastChapter));
    }
  }

  async function drawToc() {
    if (!directory) {
      panels.append(h('div', { class: 'sk-row' }, h('div', null, h('div', { class: 'skeleton sk-line', style: { height: '40px' } }))));
      try {
        const data = await api('/api/v1/books/' + id + '/directory', {}, { signal: ctx.signal, timeout: 120000 });
        directory = (data.data && data.data.item_data_list) || [];
      } catch (err) {
        clear(panels);
        panels.append(errorState(err, () => { directory = null; drawToc(); }));
        return;
      }
      clear(panels);
    }
    const items = directory || [];
    if (!items.length) { panels.append(emptyState({ icon: 'format_list_bulleted', title: '没有目录' })); return; }
    const saved = progress();
    const current = saved && saved.itemId;
    const list = h('div', { class: 'toc' });
    const renderBatch = () => {
      const end = Math.min(items.length, shown + 200);
      let volume = '';
      for (let i = shown; i < end; i += 1) {
        const item = items[i];
        if (item.volume_name && item.volume_name !== volume) {
          volume = item.volume_name;
          list.append(h('div', { class: 'toc-volume' }, volume));
        }
        list.append(h('a', { class: 'toc-item' + (String(item.item_id) === String(current) ? ' active' : ''), href: '#/read/' + id + '/' + item.item_id },
          h('i', null, 'article'), h('span', null, item.title || '未命名章节'),
        ));
      }
      shown = end;
    };
    renderBatch();
    panels.append(list);
    if (shown < items.length) {
      panels.append(h('div', { class: 'toc-more' }, h('button', { class: 'act tonal', type: 'button', onclick: (/** @type {any} */ event) => {
        const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
        renderBatch();
        if (shown >= items.length) button.closest('.toc-more')?.remove();
      } }, '加载更多（' + (items.length - shown) + '）')));
    }
  }

  async function drawReviews() {
    const list = h('div', { class: 'comment-list' });
    panels.append(list);
    let offset = 0;
    /** @type {any} */
    let more = null;
    const loadReviews = async () => {
      const data = await api('/api/v1/books/' + id + '/reviews', { count: 20, offset }, { signal: ctx.signal });
      const items = (data.data && data.data.data_list) || [];
      offset += items.length;
      for (const item of items) list.append(commentView(commentOf(item)));
      if (!items.length && !list.children.length) list.append(emptyState({ icon: 'reviews', title: '还没有书评', text: '去读几章，回来留下你的想法。' }));
      if (items.length === 20 && !more) {
        more = h('div', { class: 'toc-more' }, h('button', { class: 'act tonal', type: 'button', onclick: async (/** @type {any} */ event) => {
          const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
          button.disabled = true;
          try { await loadReviews(); } finally { button.disabled = false; }
        } }, '加载更多'));
        panels.append(more);
      }
    };
    try { await loadReviews(); }
    catch (err) { if (!(err instanceof DOMException)) { clear(panels); panels.append(errorState(err, drawReviews)); } }
  }

  async function drawComments() {
    try {
      const data = await api('/api/v1/books/' + id + '/comments', { count: 20, offset: 0 }, { signal: ctx.signal });
      const comments = (data.data && data.data.comment) || [];
      if (!comments.length) { panels.append(emptyState({ icon: 'chat_bubble', title: '还没有点评' })); return; }
      panels.append(h('div', { class: 'result-summary' }, h('i', null, 'forum'), (data.data.context || '') + ' · ' + num(data.data.comment_cnt) + ' 条'));
      panels.append(commentList(comments));
    } catch (err) { if (!(err instanceof DOMException)) panels.append(errorState(err, drawComments)); }
  }

  async function drawRelated() {
    try {
      const data = await api('/api/v1/books/' + id + '/related', {}, { signal: ctx.signal });
      const books = cellContent([{ cell_data: (data.data && data.data.cell_data) || [] }]).books;
      if (!books.length) { panels.append(emptyState({ icon: 'auto_stories', title: '暂无相关推荐' })); return; }
      panels.append(h('div', { class: 'grid-books' }, books.slice(0, 20).map((/** @type {any} */ item) => bookCard(item))));
    } catch (err) { if (!(err instanceof DOMException)) panels.append(errorState(err, drawRelated)); }
  }

  try {
    const data = await api('/api/v1/books/' + id, {}, { signal: ctx.signal });
    detail = data.data || {};
    book = bookOf(detail);
    book.first = detail.first_chapter_item_id;
    book.authorId = detail.author_id;
    book.lastChapter = detail.last_chapter_title;
    ctx.title('书籍');
    clear(shell);
    shell.append(h('div', { class: 'detail-page' }, renderHero(), tabRow, panels));
    renderTabs();
    drawPanel();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    clear(shell);
    shell.append(errorState(err, () => render()));
  }

  return () => { /* nothing persistent */ };
});

/* ---------- reader ---------- */

const chapterCache = new Map();

/** Leave the reader without stacking a duplicate book entry. */
function leaveReader(/** @type {string} */ fallback) {
  const before = location.hash;
  history.back();
  setTimeout(() => { if (location.hash === before) go(fallback, true); }, 260);
}

route('read', async (/** @type {HTMLElement} */ root, /** @type {any} */ ctx) => {
  const bookId = ctx.params[0] || '';
  const itemId = ctx.params[1] || '';
  ctx.title('阅读');
  document.body.classList.add('reader-page');

  const titleBar = h('div', { class: 'title' }, '载入中…');
  const bar = h('div', { class: 'reader-bar' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': '返回', onclick: () => leaveReader('#/book/' + bookId) }, h('i', null, 'arrow_back')),
    titleBar,
    h('button', { class: 'icon-btn', type: 'button', title: '目录', onclick: openToc }, h('i', null, 'format_list_bulleted')),
    h('button', { class: 'icon-btn', type: 'button', title: '章评', onclick: openChapterComments }, h('i', null, 'forum')),
    h('button', { class: 'icon-btn', type: 'button', title: '阅读设置', onclick: openSettings }, h('i', null, 'tune')),
  );
  const pct = h('span', { class: 'pct' });
  bar.insertBefore(pct, bar.children[2]);
  const paper = h('div', { class: 'reader-wrap' }, h('article', { class: 'reader' }, h('div', { class: 'skeleton sk-line', style: { width: '60%', height: '24px', marginBottom: '24px' } })));
  root.append(bar, paper);

  /** @type {any} */
  let chapter = null;
  /** @type {any[]} */
  let paragraphs = [];
  /** @type {any[]} */
  let toc = [];
  /** @type {Map<number,{count:number,list:any[]}>} */
  let reviewMap = new Map();
  let indexOf = -1;

  function applyReaderStyle() {
    const body = document.body;
    body.classList.remove('reader-paper', 'reader-night', 'reader-green');
    body.classList.add('reader-page', 'reader-' + (cfg.paper || 'paper'));
    document.documentElement.style.setProperty('--reader-scale', String(cfg.scale || 1));
    document.documentElement.style.setProperty('--reader-line', String(cfg.line || 1.9));
  }
  applyReaderStyle();

  function renderChapter() {
    if (!paper.isConnected) return;
    const article = /** @type {HTMLElement} */ (qs('.reader', paper));
    clear(article);
    article.append(h('h1', null, chapter.title || '无题'));
    for (const para of paragraphs) {
      const count = (reviewMap.get(para.idx) || {}).count || 0;
      const mark = h('button', { class: 'para-mark', type: 'button', title: '查看本段评论', onclick: () => openPara(para.idx) },
        h('i', null, 'chat_bubble'), count ? String(count) : '');
      const p = h('p', { dataset: { idx: String(para.idx) } }, para.text, mark);
      article.append(p);
    }
    article.append(h('div', { class: 'reader-nav' },
      h('button', { class: 'act ghost', type: 'button', onclick: () => jump(-1) }, h('i', null, 'chevron_left'), '上一章'),
      h('button', { class: 'act ghost', type: 'button', onclick: () => jump(1) }, '下一章', h('i', null, 'chevron_right')),
    ));
    titleBar.textContent = chapter.title || '阅读';
    ctx.title(chapter.title || '阅读');
    if (indexOf >= 0 && toc.length) pct.textContent = Math.max(1, Math.round(((indexOf + 1) / toc.length) * 100)) + '%';
  }

  /** @param {number} delta */
  function jump(delta) {
    if (indexOf < 0 || !toc.length) return;
    const next = toc[indexOf + delta];
    if (!next) { toast(delta > 0 ? '已经是最后一章' : '已经是第一章'); return; }
    go('#/read/' + bookId + '/' + next.item_id, true);
  }

  function openToc() {
    if (!toc.length) { toast('目录还没加载好'); return; }
    const input = h('input', { class: 'search-input', type: 'search', placeholder: '搜索章节', 'aria-label': '搜索章节', style: { marginBottom: '8px' } });
    const list = h('div', { class: 'toc', style: { maxHeight: '52vh', overflow: 'auto' } });
    const draw = () => {
      const word = input.value.trim();
      clear(list);
      toc.filter((/** @type {any} */ item) => !word || String(item.title).includes(word)).slice(0, 300).forEach((/** @type {any} */ item) => {
        list.append(h('a', { class: 'toc-item' + (String(item.item_id) === String(itemId) ? ' active' : ''), href: '#/read/' + bookId + '/' + item.item_id },
          h('span', null, item.title || '')));
      });
    };
    input.addEventListener('input', draw);
    draw();
    openDialog({ title: '目录', body: h('div', null, input, list), actions: [{ label: '关闭', value: '' }] });
  }

  /** @param {number} idx */
  async function openPara(idx) {
    try {
      const data = await api('/api/v1/chapters/' + itemId + '/paragraphs/' + idx + '/reviews', { count: 20 });
      const bucket = data.data && (data.data[String(idx)] || data.data[idx] || (data.data.data && data.data.data[String(idx)]));
      const infos = ((bucket && bucket.infos) || []).filter((/** @type {any} */ item) => commentOf(item).text);
      const count = (bucket && bucket.count) || 0;
      let body;
      if (infos.length) body = commentList(infos);
      else if (count) body = h('p', null, '上游返回了 ' + num(count) + ' 条段落热度，但没有下发评论正文（这是接口行为，不是加载失败）。');
      else body = h('p', null, '这一段还没有评论。');
      await openDialog({
        title: '第 ' + (idx + 1) + ' 段 · 段评',
        body,
        actions: [{ label: '关闭', value: '' }],
      });
    } catch (err) { toast(msg(err) || '段评加载失败', true); }
  }

  async function openChapterComments() {
    const infos = [];
    for (const [key, bucket] of reviewMap) {
      if (!bucket.list) continue;
      for (const item of bucket.list) infos.push({ item, para: Number(key) });
    }
    if (!infos.length) {
      try {
        const data = await api('/api/v1/chapters/' + itemId + '/reviews', { count: 100 });
        const map = (data.data && data.data.data) || {};
        for (const [key, bucket] of Object.entries(map)) {
          for (const item of bucket.infos || []) infos.push({ item, para: Number(key) });
        }
      } catch (_) { /* ignore */ }
    }
    const body = h('div', { class: 'dialog-scroll' });
    if (!infos.length) body.append(h('p', null, '本章还没有评论。'));
    for (const { item, para } of infos) {
      body.append(h('div', null,
        h('div', { class: 'tiny muted', style: { marginTop: '8px' } }, '第 ' + (para + 1) + ' 段'),
        commentView(commentOf(item)),
      ));
    }
    await openDialog({ title: '本章评论', body, actions: [{ label: '关闭', value: '' }] });
  }

  function openSettings() {
    const scale = h('input', { type: 'range', min: '0.85', max: '1.35', step: '0.05', value: String(cfg.scale), 'aria-label': '字号' });
    const line = h('input', { type: 'range', min: '1.6', max: '2.3', step: '0.1', value: String(cfg.line), 'aria-label': '行距' });
    const scaleOut = h('span', { class: 'range-value' }, Math.round(cfg.scale * 100) + '%');
    const lineOut = h('span', { class: 'range-value' }, cfg.line.toFixed(1));
    const swatches = h('div', { class: 'paper-options' });
    const drawSwatches = () => {
      clear(swatches);
      for (const [key, label, color] of [['paper', '纸', '#F7F2E8'], ['green', '护眼', '#E9F0E4'], ['night', '夜', '#11100E']]) {
        swatches.append(h('button', {
          class: 'paper-option' + (cfg.paper === key ? ' active' : ''), type: 'button',
          onclick: () => { cfg.paper = key; saveConfig({ paper: key }); applyReaderStyle(); drawSwatches(); },
        }, h('span', { class: 'paper-dot', style: { background: color } }), label));
      }
    };
    drawSwatches();
    const body = h('div', null,
      h('div', { class: 'range-row' }, h('label', null, '字号'), scale, scaleOut),
      h('div', { class: 'range-row' }, h('label', null, '行距'), line, lineOut),
      h('div', { class: 'range-row' }, h('label', null, '纸面'), swatches),
    );
    scale.addEventListener('input', () => {
      cfg.scale = Number(scale.value);
      scaleOut.textContent = Math.round(cfg.scale * 100) + '%';
      saveConfig({ scale: cfg.scale });
      applyReaderStyle();
    });
    line.addEventListener('input', () => {
      cfg.line = Number(line.value);
      lineOut.textContent = cfg.line.toFixed(1);
      saveConfig({ line: cfg.line });
      applyReaderStyle();
    });
    openSheet({ title: '阅读设置', body });
  }

  // scroll progress
  let scrollTimer = 0;
  const onScroll = () => {
    clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      if (!chapter) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      const total = toc.length || 0;
      saveProgress(bookId, {
        itemId,
        title: chapter.title || '',
        index: indexOf,
        pct: total ? Math.round(((indexOf + 1) / total) * 100) : Math.round(ratio * 100),
      });
    }, 400);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  try {
    const cached = chapterCache.get(itemId);
    const [data, dirData] = await Promise.all([
      cached ? Promise.resolve(cached) : api('/api/v1/chapters/' + itemId, {}, { signal: ctx.signal, timeout: 90000 }),
      toc.length ? Promise.resolve(null) : api('/api/v1/books/' + bookId + '/directory', {}, { signal: ctx.signal, timeout: 120000 }).catch(() => null),
    ]);
    chapter = data.data || {};
    if (!cached) chapterCache.set(itemId, data);
    paragraphs = paragraphsOf(chapter.content);
    if (!paragraphs.length) throw new Error('本章没有可显示的正文');
    if (dirData && dirData.data) toc = dirData.data.item_data_list || [];
    else if (toc.length === 0) toc = readStore('toc.' + bookId, []);
    if (toc.length) writeStore('toc.' + bookId, toc);
    indexOf = toc.findIndex((item) => String(item.item_id) === String(itemId));
    renderChapter();
    saveProgress(bookId, {
      itemId, title: chapter.title || '', index: indexOf,
      pct: toc.length ? Math.round(((indexOf + 1) / toc.length) * 100) : 0,
    });
    pushHistory({ id: 'read:' + bookId, bookId, itemId, title: chapter.title || '', kind: 'book' });

    api('/api/v1/chapters/' + itemId + '/reviews', { count: 100 }).then((reviews) => {
      const map = (reviews.data && reviews.data.data) || {};
      if (!paper.isConnected) return;
      for (const [key, bucket] of Object.entries(map)) {
        reviewMap.set(Number(key), { count: bucket.count || (bucket.infos || []).length, list: bucket.infos || [] });
      }
      renderChapter();
    }).catch(() => { /* 章评不是必需 */ });

    const next = indexOf >= 0 ? toc[indexOf + 1] : null;
    if (next && !chapterCache.has(next.item_id)) {
      api('/api/v1/chapters/batch', { item_ids: next.item_id }, { timeout: 90000 })
        .then((batch) => chapterCache.set(next.item_id, { data: batch.data[next.item_id] }))
        .catch(() => { /* 预取失败不影响阅读 */ });
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    clear(paper);
    paper.append(errorState(err, () => render()));
  }

  return () => {
    window.removeEventListener('scroll', onScroll);
    document.body.classList.remove('reader-page', 'reader-paper', 'reader-night', 'reader-green');
    document.documentElement.style.removeProperty('--reader-scale');
    document.documentElement.style.removeProperty('--reader-line');
  };
});
