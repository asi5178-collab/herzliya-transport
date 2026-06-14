"""
Take high-resolution (2x device scale) screenshots of the ALICE app
for embedding in the academic paper.
"""
import asyncio, os
from playwright.async_api import async_playwright

BASE    = "https://3000-i53akokq47ajrv1xn5o62-d0b9e1e2.sandbox.novita.ai"
OUT_DIR = "/home/user/webapp/paper_figures"
os.makedirs(OUT_DIR, exist_ok=True)

async def shot(page, path, full=False):
    await page.wait_for_load_state("networkidle", timeout=20000)
    await asyncio.sleep(1.5)
    await page.screenshot(path=path, full_page=full, scale="device")
    sz = os.path.getsize(path) // 1024
    print(f"  📸  {os.path.basename(path)}  ({sz} KB)")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # 2× device scale factor → crisp text at half the CSS pixels
        ctx = await browser.new_context(
            viewport={"width": 1400, "height": 860},
            device_scale_factor=2,
            locale="he-IL",
        )
        page = await ctx.new_page()

        # ── Login ──────────────────────────────────────────────────────────
        await page.goto(f"{BASE}/login.html")
        await page.wait_for_load_state("networkidle")
        await asyncio.sleep(1)
        await page.fill('input[type="text"]',     "admin")
        await page.fill('input[type="password"]', "admin123")
        await page.click('button[type="submit"]')
        await asyncio.sleep(2)

        # ── Dashboard ──────────────────────────────────────────────────────
        await page.goto(f"{BASE}/index.html")
        await shot(page, f"{OUT_DIR}/fig2_dashboard.png")

        # ── Analysis — parent tab ──────────────────────────────────────────
        await page.goto(f"{BASE}/analysis.html")
        await page.wait_for_load_state("networkidle")
        await asyncio.sleep(2)
        await shot(page, f"{OUT_DIR}/fig4_analysis_parents.png")

        # ── Analysis — student tab ─────────────────────────────────────────
        await page.evaluate("switchTab('students')")
        await asyncio.sleep(1.5)
        await shot(page, f"{OUT_DIR}/fig5_analysis_students.png")

        # ── Analysis — comparison tab ──────────────────────────────────────
        await page.evaluate("switchTab('comparison')")
        await asyncio.sleep(2.5)   # chart animation
        await shot(page, f"{OUT_DIR}/fig6_comparison.png")

        # ── Students ───────────────────────────────────────────────────────
        await page.goto(f"{BASE}/students.html")
        await shot(page, f"{OUT_DIR}/fig3_students.png")

        # ── Tasks ──────────────────────────────────────────────────────────
        await page.goto(f"{BASE}/tasks.html")
        await shot(page, f"{OUT_DIR}/fig7_tasks.png")

        # ── Weekly reports ─────────────────────────────────────────────────
        await page.goto(f"{BASE}/weekly.html")
        await shot(page, f"{OUT_DIR}/fig8_weekly.png")

        # ── Route optimization ─────────────────────────────────────────────
        await page.goto(f"{BASE}/optimization.html")
        await asyncio.sleep(2)
        await shot(page, f"{OUT_DIR}/fig9_optimization.png")

        await browser.close()
    print("\n✅  All HQ screenshots done.")

asyncio.run(main())
