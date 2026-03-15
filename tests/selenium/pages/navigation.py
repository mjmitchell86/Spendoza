"""Page object for sidebar and navigation components."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class Navigation(BasePage):
    """Encapsulates sidebar, header, and bottom nav interactions."""

    # Sidebar links (desktop)
    SIDEBAR = (By.XPATH, "//nav[contains(@class,'sidebar')] | //aside")
    SIDEBAR_LINK_DASHBOARD = (By.XPATH, "//nav//a[contains(@href,'/dashboard')]")
    SIDEBAR_LINK_INCOME = (By.XPATH, "//nav//a[contains(@href,'/income')]")
    SIDEBAR_LINK_EXPENSES = (By.XPATH, "//nav//a[contains(@href,'/expenses')]")
    SIDEBAR_LINK_CATEGORIES = (By.XPATH, "//nav//a[contains(@href,'/categories')]")
    SIDEBAR_LINK_TRANSACTIONS = (By.XPATH, "//nav//a[contains(@href,'/transactions')]")
    SIDEBAR_LINK_BANK_STATEMENTS = (By.XPATH, "//nav//a[contains(@href,'/bank-statements')]")
    SIDEBAR_LINK_GOALS = (By.XPATH, "//nav//a[contains(@href,'/goals')]")
    SIDEBAR_LINK_DEBTS = (By.XPATH, "//nav//a[contains(@href,'/debts')]")
    SIDEBAR_LINK_HOUSEHOLD = (By.XPATH, "//nav//a[contains(@href,'/household')]")
    SIDEBAR_LINK_BILLING = (By.XPATH, "//nav//a[contains(@href,'/billing')]")
    SIDEBAR_LINK_ABOUT = (By.XPATH, "//nav//a[contains(@href,'/about')]")

    # Header user menu
    USER_MENU_TRIGGER = (By.XPATH, "//header//button[contains(@class,'avatar') or .//span[contains(@class,'avatar')]]")
    MENU_PROFILE = (By.XPATH, "//*[@role='menuitem'][contains(.,'Profile')]")
    MENU_SETTINGS = (By.XPATH, "//*[@role='menuitem'][contains(.,'Settings')]")
    MENU_LOGOUT = (By.XPATH, "//*[@role='menuitem'][contains(.,'Log out') or contains(.,'Logout')]")
    MENU_INVITE_CODES = (By.XPATH, "//*[@role='menuitem'][contains(.,'Invite')]")

    # Bottom nav (mobile)
    BOTTOM_NAV = (By.XPATH, "//nav[contains(@class,'bottom') or contains(@class,'fixed')]")
    BOTTOM_DASHBOARD = (By.XPATH, "//nav//a[contains(@href,'/dashboard')]")
    BOTTOM_INCOME = (By.XPATH, "//nav//a[contains(@href,'/income')]")
    BOTTOM_EXPENSES = (By.XPATH, "//nav//a[contains(@href,'/expenses')]")
    BOTTOM_GOALS = (By.XPATH, "//nav//a[contains(@href,'/goals')]")
    BOTTOM_MORE_BUTTON = (By.XPATH, "//button[contains(.,'More')]")

    # Branding
    LOGO_TEXT = (By.XPATH, "//*[contains(text(),'Spendoza')]")

    def navigate_to(self, page: str):
        """Navigate via sidebar link. page should be the href path segment."""
        link = self.find_clickable(
            By.XPATH, f"//nav//a[contains(@href,'/{page}')]"
        )
        link.click()
        self.wait_for_url(f"/{page}")

    def open_user_menu(self):
        self.find_clickable(*self.USER_MENU_TRIGGER).click()

    def go_to_profile(self):
        self.open_user_menu()
        self.find_clickable(*self.MENU_PROFILE).click()
        self.wait_for_url("/profile")

    def logout(self):
        self.open_user_menu()
        self.find_clickable(*self.MENU_LOGOUT).click()

    def has_sidebar(self) -> bool:
        return self.is_element_present(*self.SIDEBAR, timeout=3)

    def has_bottom_nav(self) -> bool:
        return self.is_element_present(*self.BOTTOM_NAV, timeout=3)

    def get_sidebar_links(self) -> list[str]:
        """Return hrefs of all sidebar navigation links."""
        links = self.find_all(By.XPATH, "//nav//a[@href]")
        return [link.get_attribute("href") or "" for link in links]

    def click_more_menu(self):
        """Open the More sheet on mobile bottom nav."""
        self.find_clickable(*self.BOTTOM_MORE_BUTTON).click()
