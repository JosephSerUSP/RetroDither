from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the index.html file
        cwd = os.getcwd()
        page.goto(f"file://{cwd}/index.html")

        # Check if the title is correct
        assert "RETRO PIXEL LAB" in page.title()

        # Verify that the dropdown for dither options contains 'bluenoise' and 'riemersma'
        # We need to wait for JS to load? It's module so it might take a tick.
        page.wait_for_load_state("networkidle")

        # Check the select element 'selDither'
        select = page.locator("#selDither")
        options = select.locator("option")

        # Get all option values
        values = options.evaluate_all("opts => opts.map(o => o.value)")

        print("Dither Options:", values)

        if "bluenoise" not in values:
            print("ERROR: bluenoise missing")
        if "riemersma" not in values:
            print("ERROR: riemersma missing")

        # Select Blue Noise
        select.select_option("bluenoise")

        # Take a screenshot
        page.screenshot(path="verification/screenshot.png")

        browser.close()

if __name__ == "__main__":
    run()
