from playwright.sync_api import sync_playwright

def verify_app():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080/index.html")
        page.wait_for_timeout(2000) # Wait for canvas to render
        page.screenshot(path="verification_initial.png")
        print("Screenshot taken")
        browser.close()

if __name__ == "__main__":
    verify_app()
