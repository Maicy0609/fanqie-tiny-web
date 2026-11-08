#!/usr/bin/env python3
"""Playwright smoke test: real static server, mocked API, no upstream writes.

Usage: python3 tests/smoke.py [--headed] [--web URL]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlsplit
from pathlib import Path

from playwright.async_api import async_playwright, Page, Route

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / "tests" / "fixtures"
TOKEN = "smoke-token"

failures: list[str] = []


def check(cond: bool, message: str) -> None:
    print(("  ok   " if cond else "  FAIL ") + message)
    if not cond:
        failures.append(message)


def load(name: str) -> dict:
    return json.loads((FIX / name).read_text())


async def fulfill_json(route: Route, name: str) -> None:
    await route.fulfill(status=200, content_type="application/json; charset=utf-8",
                        body=(FIX / name).read_text())


def fixture_for(path: str, method: str) -> str | None:
    if path in ("/healthz", "/readyz"):
        return "health.json"
    if path == "/api/v1/recommend/homepage" or path == "/api/v1/recommend":
        return "home.json"
    if path == "/api/v1/recommend/channels":
        return "channels.json"
    if path == "/api/v1/search":
        return "search.json"
    if path == "/api/v1/search/hot":
        return "hot.json"
    if path == "/api/v1/search/cue":
        return "cue.json"
    if path == "/api/v1/search/fanqie":
        return "search.json"
    if path == "/api/v1/category":
        return "category.json"
    if path == "/api/v1/books/1001/directory":
        return "directory.json"
    if path == "/api/v1/books/1001/reviews":
        return "reviews.json"
    if path == "/api/v1/books/1001/comments":
        return "comments.json"
    if path == "/api/v1/books/1001/related":
        return "related.json"
    if path == "/api/v1/books/1001/tones":
        return "tones.json"
    if path == "/api/v1/books/1001/share":
        return "share.json"
    if path == "/api/v1/books/1001":
        return "book.json"
    if path == "/api/v1/books/3001/directory":
        return "audio_dir.json"
    if path == "/api/v1/books/3001/tones":
        return "tones.json"
    if path.startswith("/api/v1/chapters/2001/paragraphs/"):
        return "para_reviews.json"
    if path == "/api/v1/chapters/2001/reviews":
        return "chapter_reviews.json"
    if path == "/api/v1/chapters/2001/timepoints":
        return "timepoints.json"
    if path == "/api/v1/chapters/2001":
        return "chapter.json"
    if path == "/api/v1/videos/5001/danmaku":
        return "danmaku.json"
    if path == "/api/v1/videos/5001/danmaku/add" and method == "POST":
        return "empty.json"
    if path == "/api/v1/videos/5001":
        return "video.json"
    if path == "/api/v1/series/5000/comments/add" and method == "POST":
        return "empty.json"
    if path == "/api/v1/series/5000/comments":
        return "comments.json"
    if path == "/api/v1/series/5000/hot-comments":
        return "comments.json"
    if path == "/api/v1/series/5000/share":
        return "share.json"
    if path == "/api/v1/series/5000/related":
        return "empty.json"
    if path == "/api/v1/series/5000":
        return "series.json"
    if path == "/api/v1/comments/c1/replies":
        return "replies.json"
    if path.startswith("/api/v1/comments/") and method == "POST":
        return "empty.json"
    if path in ("/api/v1/manga/6001", "/api/v1/manga/6002"):
        return "manga.json"
    if path == "/api/v1/audio/books/3001":
        return "audio.json"
    if path == "/api/v1/audio/books/3001/chapters/3002":
        return "audio_chapter.json"
    if path == "/api/v1/audio/wkcontent/3002":
        return "wkcontent.json"
    if path == "/api/v1/audio/play":
        return "audio_play.json"
    if path == "/api/v1/shuqi/search":
        return "shuqi_search.json"
    if path == "/api/v1/shuqi/book":
        return "shuqi_book.json"
    if path == "/api/v1/shuqi/toc":
        return "shuqi_toc.json"
    if path == "/api/v1/shuqi/chapter":
        return "shuqi_chapter.json"
    if path == "/api/v1/authors/42":
        return "author.json"
    if path == "/api/v1/authors/42/bookshelf":
        return "author_books.json"
    if path == "/api/v1/rank/7001":
        return "rank.json"
    return None


async def handle(route: Route) -> None:
    request = route.request
    url = request.url
    path = urlsplit(url).path
    if path.startswith("/src/"):
        if path.endswith(".png"):
            await route.fulfill(status=200, content_type="image/png", body=(FIX / "pixel.png").read_bytes())
        else:
            await route.fulfill(status=200, content_type="video/mp4", body=(FIX / "tiny.mp4").read_bytes())
        return
    if url.startswith("https://cdn.test/"):
        await route.fulfill(status=200, content_type="image/png", body=(FIX / "pixel.png").read_bytes())
        return
    if path.startswith("/api/") or path in ("/healthz", "/readyz"):
        name = fixture_for(path, request.method)
        if name:
            await fulfill_json(route, name)
        else:
            await fulfill_json(route, "empty.json")
        return
    await route.continue_()


async def wait_ready(url: str, timeout: float = 10.0) -> None:
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("static server did not start")


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--web", default="")
    parser.add_argument("--headed", action="store_true")
    args = parser.parse_args()

    server = None
    web = args.web
    if not web:
        binary = ROOT / "server" / "fanqie-tiny-server"
        if not binary.exists():
            binary = ROOT / "server" / "target" / "release" / "fanqie-tiny-server"
        if not binary.exists():
            print("build the server first: cargo build --release --manifest-path server/Cargo.toml", file=sys.stderr)
            return 2
        web = "http://127.0.0.1:8099"
        server = subprocess.Popen([str(binary), "--listen", "127.0.0.1:8099", "--root", str(ROOT)],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            await wait_ready(web + "/")
        except Exception as exc:
            print(exc, file=sys.stderr)
            server.kill()
            return 2

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=not args.headed,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu-sandbox", "--use-gl=swiftshader"],
            )
            context = await browser.new_context(viewport={"width": 1440, "height": 1000})
            await context.add_init_script(
                "localStorage.setItem('fq.config', %s)" % json.dumps(json.dumps({
                    "base": "", "token": TOKEN, "theme": "dark", "accent": "tomato",
                    "scale": 1, "line": 1.9, "paper": "paper",
                }))
            )
            page = await context.new_page()
            errors: list[str] = []
            page.on("console", lambda m: errors.append(m.type + ": " + m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
            await page.route("**/*", handle)

            print("home")
            await page.goto(web + "/#/", wait_until="domcontentloaded")
            try:
                await page.wait_for_selector(".hero h1", timeout=8000)
            except Exception:
                print("DEBUG view:", (await page.locator("#view").inner_text())[:400].replace("\n", " | "))
                print("DEBUG errors:", errors[:6])
                print("DEBUG html:", (await page.locator("body").inner_html())[:300])
                raise
            check("测试之书" in await page.locator(".hero h1").inner_text(), "hero shows the first book")
            check(await page.locator(".book-card").count() >= 1, "book shelf renders")
            check(await page.locator(".series-card").count() >= 1, "series shelf renders")
            await page.locator(".home-tabs .tab", has_text="小说").click()
            await page.wait_for_timeout(400)
            check("第二本书" in await page.locator(".hero h1").inner_text(), "channel switch loads its own hero")
            await page.screenshot(path=str(ROOT / "tests/screenshots/home.png"))

            print("search")
            await page.goto(web + "/#/search", wait_until="domcontentloaded")
            await page.wait_for_selector(".hot-item")
            check(await page.locator(".hot-item").count() == 2, "hot list renders")
            await page.goto(web + "/#/search?q=%E5%89%91%E6%9D%A5", wait_until="domcontentloaded")
            await page.wait_for_selector(".book-card")
            check(await page.locator(".book-card").count() >= 2, "search results render")
            await page.locator(".result-tabs .tab", has_text="短剧").click()
            await page.wait_for_timeout(400)
            check(await page.locator(".series-row").count() >= 1, "search tab switches to series")
            await page.screenshot(path=str(ROOT / "tests/screenshots/search.png"))

            print("book")
            await page.goto(web + "/#/book/1001", wait_until="domcontentloaded")
            await page.wait_for_selector(".detail-panel")
            check("测试之书" in await page.locator(".detail-main h1").inner_text(), "book detail title")
            await page.locator(".detail-tabs .tab", has_text="目录").click()
            await page.wait_for_selector(".toc-item")
            check(await page.locator(".toc-item").count() == 3, "directory renders chapters")
            await page.locator(".detail-tabs .tab", has_text="书评").click()
            await page.wait_for_selector(".comment")
            check(await page.locator(".comment").count() == 2, "book reviews render")
            await page.screenshot(path=str(ROOT / "tests/screenshots/book.png"))

            print("reader")
            await page.goto(web + "/#/read/1001/2001", wait_until="domcontentloaded")
            await page.wait_for_selector(".reader p")
            check(await page.locator(".reader p").count() == 3, "chapter paragraphs render")
            await page.locator(".reader p").first.hover()
            await page.locator(".para-mark").first.click()
            await page.wait_for_selector("dialog")
            check("这条测试评论" in await page.locator("dialog").inner_text() or "测试评论" in await page.locator("dialog").inner_text(), "paragraph comments dialog")
            await page.keyboard.press("Escape")
            await page.locator("button[title='阅读设置']").click()
            await page.wait_for_selector(".sheet")
            await page.locator(".sheet input[type=range]").first.fill("1.2")
            await page.wait_for_timeout(300)
            stored = await page.evaluate("()=>JSON.parse(localStorage.getItem('fq.config')).scale")
            check(abs(float(stored) - 1.2) < 0.001, "reader scale persists")
            await page.keyboard.press("Escape")
            await page.screenshot(path=str(ROOT / "tests/screenshots/reader.png"))

            print("series / watch")
            await page.goto(web + "/#/series/5000", wait_until="domcontentloaded")
            await page.wait_for_selector(".detail-main h1")
            check("测试短剧" in await page.locator(".detail-main h1").inner_text(), "series title")
            check(await page.locator(".ep-btn").count() == 2, "episodes render")
            await page.locator(".ep-btn").first.click()
            await page.wait_for_selector("video[src]")
            src = await page.locator("video").get_attribute("src")
            check("/src/tiny.mp4" in (src or ""), "video uses the decrypted /src stream")
            await page.locator(".dm-composer input").fill("冒烟弹幕")
            await page.locator(".dm-composer button[type=submit]").click()
            await page.wait_for_timeout(600)
            check(await page.locator(".dm").count() >= 1, "danmaku composer spawns a comment")
            await page.screenshot(path=str(ROOT / "tests/screenshots/watch.png"))

            print("manga")
            await page.goto(web + "/#/manga/1001/6002", wait_until="domcontentloaded")
            await page.wait_for_selector(".manga-page img")
            check(await page.locator(".manga-page img").count() == 2, "manga pages render")
            check(await page.locator(".manga-page img").first.is_visible(), "manga image visible")
            await page.screenshot(path=str(ROOT / "tests/screenshots/manga.png"))

            print("audio")
            await page.goto(web + "/#/audio/3001", wait_until="domcontentloaded")
            await page.wait_for_selector(".tr-line")
            check(await page.locator(".tr-line").count() == 2, "audio transcript renders")
            await page.locator("button", has_text="查看播放信息").click()
            await page.wait_for_selector("dialog")
            check("audio/play" in await page.locator("dialog").inner_text(), "play diagnostics show audio/play result")
            await page.keyboard.press("Escape")
            await page.screenshot(path=str(ROOT / "tests/screenshots/audio.png"))

            print("shuqi")
            await page.goto(web + "/#/shuqi?q=%E6%B5%8B%E8%AF%95", wait_until="domcontentloaded")
            await page.wait_for_selector(".book-card")
            check("测试书旗书" in await page.locator(".book-card").inner_text(), "shuqi search result")
            await page.locator(".book-card").first.click()
            await page.wait_for_selector(".detail-main h1")
            await page.locator(".toc-item").first.click()
            await page.wait_for_selector(".reader p")
            check(await page.locator(".reader p").count() == 2, "shuqi chapter renders")

            print("shelf")
            await page.goto(web + "/#/book/1001", wait_until="domcontentloaded")
            await page.wait_for_selector(".detail-panel")
            button = page.locator("button", has_text="加入书架")
            if await button.count():
                await button.click()
            await page.goto(web + "/#/shelf", wait_until="domcontentloaded")
            await page.wait_for_timeout(400)
            check(await page.locator(".book-card").count() == 1, "shelf keeps the book")

            print("settings")
            await page.goto(web + "/#/settings", wait_until="domcontentloaded")
            await page.locator("button", has_text="测试连接").click()
            await page.wait_for_timeout(800)
            check("就绪" in await page.locator(".kv").first.inner_text(), "connection test reports ready")

            print("dev console")
            await page.goto(web + "/#/dev", wait_until="domcontentloaded")
            check(await page.locator(".dev-item").count() == 67, "all documented routes are listed")
            await page.locator(".dev-item").first.locator("summary").click()
            await page.locator(".dev-item").first.locator("button", has_text="发送").click()
            await page.wait_for_timeout(600)
            check("code 0" in await page.locator(".dev-item").first.locator(".result").inner_text(), "dev console request succeeds")
            await page.screenshot(path=str(ROOT / "tests/screenshots/dev.png"))

            print("mobile")
            mobile = await browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            await mobile.add_init_script(
                "localStorage.setItem('fq.config', %s)" % json.dumps(json.dumps({
                    "base": "", "token": TOKEN, "theme": "dark", "accent": "tomato",
                    "scale": 1, "line": 1.9, "paper": "paper",
                }))
            )
            mp = await mobile.new_page()
            await mp.route("**/*", handle)
            await mp.goto(web + "/#/", wait_until="domcontentloaded")
            await mp.wait_for_selector(".hero h1")
            check(await mp.locator(".tabbar").is_visible(), "mobile bottom nav visible")
            check(not await mp.locator(".rail").is_visible(), "mobile rail hidden")
            await mp.screenshot(path=str(ROOT / "tests/screenshots/mobile.png"))

            check(not [e for e in errors if "favicon" not in e], "no console errors: " + "; ".join(errors[:3]))
            await browser.close()
    finally:
        if server:
            server.terminate()
            server.wait(timeout=5)

    print()
    if failures:
        print(f"{len(failures)} failure(s)")
        for item in failures:
            print(" -", item)
        return 1
    print("all smoke checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
