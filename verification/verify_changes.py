
import os
from playwright.sync_api import sync_playwright, expect

def verify_app():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the local HTML file
        file_path = os.path.abspath('index.html')
        page.goto(f'file://{file_path}')

        # 1. Verify Labels (Accessibility)
        # Check if inputs have labels
        print("Verifying accessibility labels...")
        expect(page.locator('input[aria-label="Contrast"]')).to_be_visible()
        expect(page.locator('input[aria-label="Brightness"]')).to_be_visible()
        expect(page.locator('select[aria-label="Palette Mode"]')).to_be_visible()

        # 2. Verify Zoom Buttons
        print("Verifying zoom buttons...")
        zoom_in = page.locator('#btnZoomIn')
        zoom_out = page.locator('#btnZoomOut')
        zoom_status = page.locator('#statusZoom')

        expect(zoom_in).to_be_visible()
        expect(zoom_out).to_be_visible()
        expect(zoom_status).to_have_text('100%')

        # Click Zoom In
        zoom_in.click()
        # Should be 200% (Snap mode is on by default in my code? Let's check state)
        # Default state: zoomSnap: true.
        # adjustZoom(1) -> 1 + 1 = 2 (200%).
        expect(zoom_status).to_have_text('200%')

        zoom_out.click()
        expect(zoom_status).to_have_text('100%')

        # 3. Verify Image Processing (Worker)
        # Wait for "DONE." in status bar.
        print("Verifying image processing...")
        status_msg = page.locator('#statusMsg')
        expect(status_msg).to_have_text('DONE.', timeout=5000)

        # Take screenshot
        print("Taking screenshot...")
        page.screenshot(path='verification/verification.png')

        browser.close()

if __name__ == '__main__':
    verify_app()
