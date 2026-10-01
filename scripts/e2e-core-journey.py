#!/usr/bin/env python3
"""Run the login -> chat -> challenge confirmation core journey through CDP."""

import argparse
import asyncio
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

import websockets


DEFAULT_BASE_URL = "http://localhost:3000"
DEFAULT_CDP_URL = "http://127.0.0.1:9225"
CHALLENGE_TEXT = "再陪我看一看"
BUY_THIS_TIME_TEXT = "这次想买"


def log(message):
    print(f"[e2e] {message}", file=sys.stderr, flush=True)


def json_get(url, timeout=5):
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


async def page_target(cdp_url):
    targets = json_get(f"{cdp_url.rstrip('/')}/json")
    for target in targets:
        if target.get("type") == "page" and target.get("webSocketDebuggerUrl"):
            return target
    raise RuntimeError("Chrome has no debuggable page target")


class CDP:
    def __init__(self, websocket):
        self.websocket = websocket
        self.next_id = 0
        self.pending = {}
        self.console_errors = []

    async def receive_loop(self):
        try:
            async for message in self.websocket:
                event = json.loads(message)
                if "id" in event and event["id"] in self.pending:
                    self.pending[event["id"]].set_result(event)
                    continue
                method = event.get("method")
                params = event.get("params", {})
                if method == "Runtime.consoleAPICalled" and params.get("type") == "error":
                    args = [str(arg.get("value", arg.get("description", ""))) for arg in params.get("args", [])]
                    self.console_errors.append(" ".join(args)[:1000])
                elif method == "Runtime.exceptionThrown":
                    details = params.get("exceptionDetails", {})
                    exception = details.get("exception", {})
                    self.console_errors.append(
                        f"{details.get('text', '')} {exception.get('description', '')}".strip()[:1000]
                    )
        except asyncio.CancelledError:
            pass

    async def send(self, method, params=None, timeout=120):
        self.next_id += 1
        message_id = self.next_id
        future = asyncio.get_running_loop().create_future()
        self.pending[message_id] = future
        await self.websocket.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
        response = await asyncio.wait_for(future, timeout=timeout)
        if "error" in response:
            raise RuntimeError(f"{method}: {response['error']}")
        return response.get("result", {})

    async def evaluate(self, expression, timeout=30):
        result = await self.send(
            "Runtime.evaluate",
            {"expression": expression, "returnByValue": True, "awaitPromise": True},
            timeout=timeout,
        )
        if result.get("exceptionDetails"):
            details = result["exceptionDetails"]
            raise RuntimeError(details.get("exception", {}).get("description") or details.get("text", "JS error"))
        return result.get("result", {}).get("value")

    async def screenshot(self, path):
        result = await self.send("Page.captureScreenshot", {"format": "png"})
        Path(path).write_bytes(base64.b64decode(result["data"]))
        return str(path)

    async def click(self, x, y):
        await self.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
        await asyncio.sleep(0.15)
        await self.send(
            "Input.dispatchMouseEvent",
            {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1},
        )
        await asyncio.sleep(0.05)
        await self.send(
            "Input.dispatchMouseEvent",
            {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1},
        )

    async def click_element(self, selector):
        position = await self.evaluate(f"(() => {{ const el = {selector}; if (!el) return null; const r = el.getBoundingClientRect(); return {{x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), disabled: el.disabled || el.getAttribute('aria-disabled') === 'true'}}; }})()")
        if not position:
            raise RuntimeError("element not found")
        if position.get("disabled"):
            raise RuntimeError("element is disabled")
        await self.click(position["x"], position["y"])


async def connect(cdp_url):
    target = await page_target(cdp_url)
    log(f"page: {target.get('url', '')}")
    websocket = await websockets.connect(target["webSocketDebuggerUrl"], max_size=64 * 1024 * 1024)
    client = CDP(websocket)
    receive_task = asyncio.create_task(client.receive_loop())
    await client.send("Runtime.enable")
    await client.send("Page.enable")
    await client.send("Network.enable")
    return client, receive_task


async def navigate(client, url):
    await client.send("Page.navigate", {"url": url})
    await asyncio.sleep(3)
    for _ in range(20):
        if await client.evaluate("document.readyState === 'complete'"):
            return
        await asyncio.sleep(0.5)
    raise RuntimeError(f"page did not finish loading: {url}")


async def wait_element(client, selector, timeout, description):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if await client.evaluate(f"!!({selector})"):
            return
        await asyncio.sleep(0.3)
    raise RuntimeError(f"timeout waiting for {description}")


async def set_react_input(client, selector, value):
    await wait_element(client, selector, 15, "input")
    # 空值防御: setter 可能 undefined (自定义元素/竞态) — 显式报"input setter unavailable"
    await client.evaluate(f"(() => {{ const el = {selector}; if (!el) throw new Error('input element disappeared'); const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set; if (!setter) throw new Error('input setter unavailable on ' + el.tagName); setter.call(el, {json.dumps(value)}); el.dispatchEvent(new Event('input', {{bubbles: true}})); }})()")
    await asyncio.sleep(0.2)


async def login(client, base_url, email, password, timeout):
    await navigate(client, f"{base_url}/zh/auth/login")
    if not await client.evaluate("!!document.querySelector('input[type=\"password\"]')"):
        log("existing login detected; skipping credentials")
        return "reused"
    await set_react_input(client, "document.querySelector('input[type=\"email\"]')", email)
    await set_react_input(client, "document.querySelector('input[type=\"password\"]')", password)
    await client.evaluate("(() => { const btn = [...document.querySelectorAll('button')].find(b => /登录|log in|sign in/i.test(b.textContent || '')); if (!btn || btn.disabled) throw new Error('login button unavailable'); btn.click(); })()")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if await client.evaluate("!window.location.pathname.includes('/auth/login') && !document.querySelector('input[type=\"password\"]')"):
            await asyncio.sleep(2)
            return "logged-in"
        await asyncio.sleep(0.5)
    raise RuntimeError("login did not complete")


async def chat_send(client, message):
    # 打法沉淀自 QA b2_chat_v5/qa6lib: 真鼠标点 input 聚焦 → Input.insertText 原生输入
    # (合成 prototype setter+dispatchEvent 会被 React 受控组件重置) → 真鼠标点发送钮
    probe = await client.evaluate("(() => { const vis = el => !!(el.offsetParent || el.getClientRects().length); const inp = [...document.querySelectorAll('input, textarea')].filter(vis).find(el => el.tagName === 'TEXTAREA' || el.type === 'text' || !el.type); if (!inp) return null; const r = inp.getBoundingClientRect(); return {x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)}; })()")
    if not probe:
        raise RuntimeError("chat composer not found")
    await client.click(probe["x"], probe["y"])
    await asyncio.sleep(0.3)
    await client.send("Input.insertText", {"text": message})
    await asyncio.sleep(0.5)
    btn = await client.evaluate("(() => { const vis = el => !!(el.offsetParent || el.getClientRects().length); const inp = [...document.querySelectorAll('input, textarea')].filter(vis).find(el => el.tagName === 'TEXTAREA' || el.type === 'text' || !el.type); if (!inp) return null; const composer = inp.closest('form') || inp.parentElement?.parentElement || document.body; const sendBtn = [...composer.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '发送'); if (!sendBtn) return null; const sr = sendBtn.getBoundingClientRect(); return {x: Math.round(sr.x + sr.width / 2), y: Math.round(sr.y + sr.height / 2), disabled: sendBtn.disabled}; })()")
    if not btn:
        raise RuntimeError("send button not found")
    if btn.get("disabled"):
        raise RuntimeError("send button disabled (input not registered)")
    await client.click(btn["x"], btn["y"])


async def wait_challenge(client, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if await client.evaluate(f"document.body.innerText.includes({json.dumps(CHALLENGE_TEXT)})"):
            return True
        await asyncio.sleep(1)
    return False


async def wait_green_alt_buy_button(client, timeout):
    selector = (
        "(() => { const cards = [...document.querySelectorAll('[data-testid=\"green-alt-card\"]')].reverse();"
        " for (const card of cards) {"
        " const button = [...card.querySelectorAll('button')].find(b => (b.textContent || '').trim() === "
        f"{json.dumps(BUY_THIS_TIME_TEXT)});"
        " if (button) return true;"
        " } return false; })()"
    )
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if await client.evaluate(selector):
            return True
        await asyncio.sleep(0.5)
    return False


async def challenge_confirm_state(client):
    return await client.evaluate(
        "(() => { const button = [...document.querySelectorAll('button')]"
        f".find(b => (b.textContent || '').trim() === {json.dumps(CHALLENGE_TEXT)});"
        " if (!button) return {found: false};"
        " const container = button.closest('div, aside, section, form');"
        " const text = container ? container.innerText : '';"
        " return {found: true, hasPrompt: text.includes('确定？'), text: text.slice(0, 300)}; })()"
    )


async def wait_challenge_confirm(client, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        state = await challenge_confirm_state(client)
        if state.get("found"):
            return state
        await asyncio.sleep(0.5)
    return {"found": False}


async def run_challenge_chain(client, args, record):
    before_send = await client.evaluate("document.body.innerText.length")
    await chat_send(client, args.challenge_message)
    flow = await message_flow(client, before_send, args.reply_timeout)
    if not flow["grew"]:
        await record("challenge-chain-send", "SUSPECT", flow)
        return
    await record("challenge-chain-send", "PASS", flow)

    button_visible = await wait_green_alt_buy_button(client, args.challenge_timeout)
    if not button_visible:
        tail = await client.evaluate("document.body.innerText.slice(-1200)")
        card_count = await client.evaluate("document.querySelectorAll('[data-testid=\"green-alt-card\"]').length")
        await record(
            "challenge-chain-card",
            "SUSPECT",
            {"reason": "green alternative buy button unavailable", "cardCount": card_count, "tail": tail},
        )
        return
    card_text = await client.evaluate(
        "(() => { const cards = [...document.querySelectorAll('[data-testid=\"green-alt-card\"]')].reverse();"
        " const card = cards.find(c => [...c.querySelectorAll('button')].some(b => (b.textContent || '').trim() === "
        f"{json.dumps(BUY_THIS_TIME_TEXT)}));"
        " return card ? card.innerText.slice(0, 500) : null; })()"
    )
    await record("challenge-chain-card", "PASS", {"button": BUY_THIS_TIME_TEXT, "cardText": card_text})

    before_buy = await client.evaluate("document.body.innerText.length")
    await client.click_element(
        "(() => { const cards = [...document.querySelectorAll('[data-testid=\"green-alt-card\"]')].reverse();"
        " for (const card of cards) {"
        " const button = [...card.querySelectorAll('button')].find(b => (b.textContent || '').trim() === "
        f"{json.dumps(BUY_THIS_TIME_TEXT)});"
        " if (button) return button;"
        " } return null; })()"
    )
    confirm = await wait_challenge_confirm(client, args.challenge_timeout)
    if not confirm.get("found") or not confirm.get("hasPrompt"):
        tail = await client.evaluate("document.body.innerText.slice(-1200)")
        buttons = await client.evaluate(
            "[...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean).slice(-30)"
        )
        await record(
            "challenge-chain-confirm",
            "SUSPECT",
            {
                "reason": "challenge confirmation not found in one container with prompt",
                "confirm": confirm,
                "buttons": buttons,
                "tail": tail,
            },
        )
        return
    await record("challenge-chain-confirm", "PASS", confirm)

    await client.click_element(
        f"(() => [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === {json.dumps(CHALLENGE_TEXT)}))"
    )
    await asyncio.sleep(2)
    closed = not (await challenge_confirm_state(client)).get("found")
    after_length = await client.evaluate("document.body.innerText.length")
    if not closed:
        tail = await client.evaluate("document.body.innerText.slice(-1200)")
        await record("challenge-chain-dismiss", "SUSPECT", {"closed": False, "tail": tail})
        return
    await record(
        "challenge-chain-dismiss",
        "PASS",
        {"closed": True, "lengthBefore": before_buy, "lengthAfter": after_length},
    )


async def message_flow(client, before_length, timeout):
    deadline = time.monotonic() + timeout
    last_length = before_length
    stable_count = 0
    while time.monotonic() < deadline:
        current = await client.evaluate("document.body.innerText.length")
        if current > before_length and current == last_length:
            stable_count += 1
            if stable_count >= 3:
                return {"grew": True, "stable": True, "length": current}
        else:
            stable_count = 0
        if current > last_length:
            last_length = current
        await asyncio.sleep(1)
    return {"grew": last_length > before_length, "stable": False, "length": last_length}


async def run(args):
    base_url = args.base_url.rstrip("/")
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise RuntimeError(f"invalid BASE_URL: {base_url}")
    os.environ.setdefault("NO_PROXY", "localhost,127.0.0.1")
    screenshot_dir = Path(args.screenshot_dir)
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    results = []

    async def record(step, status, evidence):
        screenshot = None
        if status != "PASS":
            path = screenshot_dir / f"e2e-{timestamp}-{step}.png"
            screenshot = await client.screenshot(path)
        results.append({"step": step, "status": status, "screenshot": screenshot, "evidence": evidence})
        log(f"{step}: {status} {evidence}")

    client, receive_task = await connect(args.cdp_url)
    try:
        login_state = await login(client, base_url, args.email, args.password, args.login_timeout)
        await record("login", "PASS", {"mode": login_state, "url": await client.evaluate("location.href")})

        await navigate(client, f"{base_url}/zh/chat")
        await wait_element(client, "(() => { const vis = el => !!(el.offsetParent || el.getClientRects().length); return [...document.querySelectorAll('input, textarea')].some(el => vis); })()", 20, "chat composer")
        await record("chat-tab", "PASS", {"url": await client.evaluate("location.href")})

        before_length = await client.evaluate("document.body.innerText.length")
        await chat_send(client, args.message)
        flow = await message_flow(client, before_length, args.reply_timeout)
        if not flow["grew"]:
            await record("send-message", "FAIL", flow)
            return 1, results
        await record("send-message", "PASS", flow)

        challenge_visible = await wait_challenge(client, args.challenge_timeout)
        if not challenge_visible:
            final_text = await client.evaluate("document.body.innerText.slice(-1200)")
            await record("challenge-confirm", "SKIPPED-CHALLENGE", {"reason": "challenge state unavailable", "tail": final_text})
        else:
            await record("challenge-confirm", "PASS", {"text": CHALLENGE_TEXT})
            before_click = await client.evaluate("document.body.innerText.length")
            await client.click_element(f"(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes({json.dumps(CHALLENGE_TEXT)})))")
            await asyncio.sleep(3)
            challenge_closed = not await client.evaluate(f"document.body.innerText.includes({json.dumps(CHALLENGE_TEXT)})")
            flow = await message_flow(client, before_click, args.reply_timeout)
            if not challenge_closed or not flow["grew"]:
                await record("challenge-action", "FAIL", {"closed": challenge_closed, **flow})
                return 1, results
            await record("challenge-action", "PASS", {"closed": True, **flow})

        if args.with_challenge:
            try:
                await run_challenge_chain(client, args, record)
            except Exception as error:
                await record("challenge-chain-error", "SUSPECT", {"error": str(error)})
        return 0, results
        return 0, results
    except Exception as error:
        try:
            await record("unexpected", "FAIL", {"error": str(error)})
        except Exception:
            results.append({"step": "unexpected", "status": "FAIL", "screenshot": None, "evidence": {"error": str(error)}})
        return 1, results
    finally:
        if client.console_errors:
            results.append({"step": "console-errors", "status": "FAIL", "screenshot": None, "evidence": client.console_errors})
        receive_task.cancel()
        try:
            await receive_task
        except asyncio.CancelledError:
            pass
        await client.websocket.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.environ.get("BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--cdp-url", default=os.environ.get("CDP_URL", DEFAULT_CDP_URL))
    parser.add_argument("--email", default=os.environ.get("E2E_EMAIL", "793160223@qq.com"))
    parser.add_argument("--password", default=os.environ.get("E2E_PASSWORD", "793160223@qq.com"))
    parser.add_argument("--message", default=os.environ.get("E2E_MESSAGE", "想买一台空气炸锅，帮我看看值不值得买"))
    parser.add_argument("--with-challenge", action="store_true", default=os.environ.get("E2E_WITH_CHALLENGE") == "1")
    parser.add_argument("--challenge-message", default=os.environ.get("E2E_CHALLENGE_MESSAGE", "我想买一台空气炸锅"))
    parser.add_argument("--login-timeout", type=float, default=45)
    parser.add_argument("--reply-timeout", type=float, default=120)
    parser.add_argument("--challenge-timeout", type=float, default=90)
    parser.add_argument("--screenshot-dir", default=os.environ.get("E2E_SCREENSHOT_DIR", "/tmp"))
    args = parser.parse_args()
    try:
        exit_code, results = asyncio.run(run(args))
    except Exception as error:
        print(json.dumps({"step": "runner", "status": "FAIL", "screenshot": None, "evidence": {"error": str(error)}}, ensure_ascii=False))
        return 1
    print(json.dumps(results, ensure_ascii=False, separators=(",", ":")))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
