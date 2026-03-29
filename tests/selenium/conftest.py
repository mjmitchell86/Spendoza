"""Pytest configuration and shared fixtures for Selenium UI tests.

Configuration is loaded from environment variables or a .env file at the
project root.  Required variables:

    TEST_BASE_URL      – Frontend URL (default: http://localhost:5173)
    TEST_USER_EMAIL    – Pre-existing test user email
    TEST_USER_PASSWORD – Pre-existing test user password

Optional:

    HEADLESS           – Run browser headless (default: true)
    BROWSER            – chrome | firefox | edge (default: chrome)
    SLOW_MO            – Extra milliseconds to wait after each action (default: 0)
    WINDOW_WIDTH       – Browser window width (default: 1280)
    WINDOW_HEIGHT      – Browser window height (default: 900)
"""

import os
import time
from pathlib import Path

import pytest
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.edge.service import Service as EdgeService

# Load .env from the project root (two levels up from this file)
_env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_env_path)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def _truthy(value: str) -> bool:
    return value.lower() in ("1", "true", "yes")

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def base_url() -> str:
    return _get_env("TEST_BASE_URL", "http://localhost:5173")


@pytest.fixture(scope="session")
def test_user() -> dict[str, str]:
    """Return credentials for an already-provisioned test user."""
    email = _get_env("TEST_USER_EMAIL")
    password = _get_env("TEST_USER_PASSWORD")
    if not email or not password:
        pytest.skip(
            "TEST_USER_EMAIL and TEST_USER_PASSWORD must be set to run authenticated tests"
        )
    return {"email": email, "password": password}


@pytest.fixture(scope="session")
def browser_name() -> str:
    return _get_env("BROWSER", "chrome").lower()


@pytest.fixture(scope="session")
def headless() -> bool:
    return _truthy(_get_env("HEADLESS", "true"))


@pytest.fixture(scope="session")
def window_size() -> tuple[int, int]:
    w = int(_get_env("WINDOW_WIDTH", "1280"))
    h = int(_get_env("WINDOW_HEIGHT", "900"))
    return (w, h)


def _build_chrome_driver(headless: bool, window_size: tuple[int, int]) -> webdriver.Chrome:
    opts = ChromeOptions()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument(f"--window-size={window_size[0]},{window_size[1]}")
    opts.add_argument("--disable-extensions")
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        service = ChromeService(ChromeDriverManager().install())
        return webdriver.Chrome(service=service, options=opts)
    except Exception:
        return webdriver.Chrome(options=opts)


def _build_firefox_driver(headless: bool, window_size: tuple[int, int]) -> webdriver.Firefox:
    opts = FirefoxOptions()
    if headless:
        opts.add_argument("--headless")
    try:
        from webdriver_manager.firefox import GeckoDriverManager
        service = FirefoxService(GeckoDriverManager().install())
        return webdriver.Firefox(service=service, options=opts)
    except Exception:
        return webdriver.Firefox(options=opts)


def _build_edge_driver(headless: bool, window_size: tuple[int, int]) -> webdriver.Edge:
    opts = EdgeOptions()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument(f"--window-size={window_size[0]},{window_size[1]}")
    try:
        from webdriver_manager.microsoft import EdgeChromiumDriverManager
        service = EdgeService(EdgeChromiumDriverManager().install())
        return webdriver.Edge(service=service, options=opts)
    except Exception:
        return webdriver.Edge(options=opts)


_BUILDERS = {
    "chrome": _build_chrome_driver,
    "firefox": _build_firefox_driver,
    "edge": _build_edge_driver,
}


@pytest.fixture(scope="session")
def driver(browser_name: str, headless: bool, window_size: tuple[int, int]):
    """Create a WebDriver instance that lives for the entire test session."""
    builder = _BUILDERS.get(browser_name)
    if builder is None:
        raise ValueError(f"Unsupported browser: {browser_name}. Choose from: {list(_BUILDERS)}")

    drv = builder(headless, window_size)
    drv.set_window_size(*window_size)
    drv.implicitly_wait(2)
    yield drv
    drv.quit()


@pytest.fixture(scope="function")
def fresh_driver(browser_name: str, headless: bool, window_size: tuple[int, int]):
    """A per-test driver instance for tests that need a clean session."""
    builder = _BUILDERS.get(browser_name)
    if builder is None:
        raise ValueError(f"Unsupported browser: {browser_name}")

    drv = builder(headless, window_size)
    drv.set_window_size(*window_size)
    drv.implicitly_wait(2)
    yield drv
    drv.quit()


@pytest.fixture()
def logged_in_driver(driver, test_user, base_url):
    """Ensure the shared driver is logged in before running the test.

    Checks if we are already on an authenticated page; if not, performs login.
    """
    from pages.login_page import LoginPage

    driver.get(f"{base_url}/dashboard")
    time.sleep(1)

    # If redirected to login, perform login
    if "/login" in driver.current_url:
        login = LoginPage(driver)
        login.login(test_user["email"], test_user["password"])
        # Wait for redirect away from login
        login.wait_for_url("/dashboard", timeout=15)
        time.sleep(1)

    # If redirected to onboarding, that's fine – individual tests can handle it
    return driver


@pytest.fixture(scope="session")
def mobile_driver(headless: bool):
    """A driver with mobile viewport dimensions (375x812 – iPhone-like)."""
    opts = ChromeOptions()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=375,812")
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        service = ChromeService(ChromeDriverManager().install())
        drv = webdriver.Chrome(service=service, options=opts)
    except Exception:
        drv = webdriver.Chrome(options=opts)
    drv.set_window_size(375, 812)
    drv.implicitly_wait(2)
    yield drv
    drv.quit()


# ---------------------------------------------------------------------------
# Pytest hooks
# ---------------------------------------------------------------------------

def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "auth: tests requiring authentication")
    config.addinivalue_line("markers", "public: tests for public (unauthenticated) pages")
    config.addinivalue_line("markers", "mobile: tests for mobile viewport")
    config.addinivalue_line("markers", "smoke: quick smoke tests")


def pytest_collection_modifyitems(config, items):
    """Auto-skip auth-marked tests when credentials are not configured."""
    email = _get_env("TEST_USER_EMAIL")
    password = _get_env("TEST_USER_PASSWORD")
    if email and password:
        return

    skip_auth = pytest.mark.skip(reason="TEST_USER_EMAIL / TEST_USER_PASSWORD not set")
    for item in items:
        if "auth" in item.keywords:
            item.add_marker(skip_auth)
