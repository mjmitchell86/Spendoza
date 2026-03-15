"""Page object for the Profile page (/profile)."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class ProfilePage(BasePage):
    """Encapsulates interactions with the profile/settings page."""

    PATH = "/profile"

    # Page
    PAGE_TITLE = (By.XPATH, "//h1[contains(text(),'Profile') or contains(text(),'Settings')]")

    # Avatar
    AVATAR_UPLOAD = (By.XPATH, "//input[@type='file']")
    AVATAR_IMAGE = (By.XPATH, "//img[contains(@class,'avatar') or contains(@alt,'avatar')]")

    # Display name
    DISPLAY_NAME_INPUT = (By.XPATH, "//input[contains(@placeholder,'name') or @id='displayName']")
    SAVE_NAME_BUTTON = (By.XPATH, "//button[normalize-space()='Save']")

    # Theme
    THEME_SYSTEM = (By.XPATH, "//button[normalize-space()='System']")
    THEME_LIGHT = (By.XPATH, "//button[normalize-space()='Light']")
    THEME_DARK = (By.XPATH, "//button[normalize-space()='Dark']")

    # Email reports
    EMAIL_REPORTS_SWITCH = (By.XPATH, "//*[contains(text(),'Email')]/ancestor::*//button[@role='switch']")

    # Subscription
    SUBSCRIPTION_BADGE = (By.XPATH, "//*[contains(text(),'Subscription') or contains(text(),'Plan')]")
    UPGRADE_BUTTON = (By.XPATH, "//button[contains(.,'Upgrade')]")
    MANAGE_BUTTON = (By.XPATH, "//button[contains(.,'Manage')]")

    # Account info
    EMAIL_DISPLAY = (By.XPATH, "//*[contains(text(),'Email')]/following-sibling::*")
    SEND_TEST_EMAIL_BUTTON = (By.XPATH, "//button[contains(.,'Send Test Email')]")

    def open(self):
        self.navigate(self.PATH)
        self.find_visible(*self.PAGE_TITLE)
        return self

    def set_display_name(self, name: str):
        el = self.find_visible(*self.DISPLAY_NAME_INPUT)
        el.clear()
        el.send_keys(name)
        self.find_clickable(*self.SAVE_NAME_BUTTON).click()

    def get_display_name(self) -> str:
        return self.find_visible(*self.DISPLAY_NAME_INPUT).get_attribute("value") or ""

    def set_theme(self, theme: str):
        themes = {
            "system": self.THEME_SYSTEM,
            "light": self.THEME_LIGHT,
            "dark": self.THEME_DARK,
        }
        self.find_clickable(*themes[theme]).click()

    def toggle_email_reports(self):
        self.find_clickable(*self.EMAIL_REPORTS_SWITCH).click()

    def has_subscription_info(self) -> bool:
        return self.is_element_present(*self.SUBSCRIPTION_BADGE)

    def click_send_test_email(self):
        self.find_clickable(*self.SEND_TEST_EMAIL_BUTTON).click()
