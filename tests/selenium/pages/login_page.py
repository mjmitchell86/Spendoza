"""Page object for the Login page (/login)."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class LoginPage(BasePage):
    """Encapsulates interactions with the login page."""

    PATH = "/login"

    # Locators
    EMAIL_INPUT = (By.ID, "email")
    PASSWORD_INPUT = (By.ID, "password")
    SIGN_IN_BUTTON = (By.XPATH, "//button[normalize-space()='Sign In']")
    SIGNING_IN_BUTTON = (By.XPATH, "//button[contains(text(),'Signing in')]")
    SIGNUP_LINK = (By.XPATH, "//a[contains(text(),'Create one')]")
    ERROR_MESSAGE = (By.XPATH, "//*[contains(@class,'destructive')]")
    PAGE_HEADING = (By.XPATH, "//h2[contains(text(),'Sign in to Spendoza')]")

    def open(self):
        self.navigate(self.PATH)
        self.find_visible(*self.PAGE_HEADING)
        return self

    def login(self, email: str, password: str):
        """Fill credentials and submit the login form."""
        self.fill_input("email", email)
        self.fill_input("password", password)
        self.find_clickable(*self.SIGN_IN_BUTTON).click()

    def is_sign_in_button_visible(self) -> bool:
        return self.is_element_present(*self.SIGN_IN_BUTTON)

    def is_signing_in_loading(self) -> bool:
        return self.is_element_present(*self.SIGNING_IN_BUTTON, timeout=2)

    def get_error(self) -> str:
        return self.find_visible(*self.ERROR_MESSAGE).text

    def go_to_signup(self):
        self.find_clickable(*self.SIGNUP_LINK).click()
        self.wait_for_url("/signup")
