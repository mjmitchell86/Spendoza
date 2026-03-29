"""Page object for the Signup page (/signup)."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class SignupPage(BasePage):
    """Encapsulates interactions with the signup page."""

    PATH = "/signup"

    # Signup form locators
    INVITE_CODE_INPUT = (By.ID, "inviteCode")
    DISPLAY_NAME_INPUT = (By.ID, "displayName")
    EMAIL_INPUT = (By.ID, "email")
    PASSWORD_INPUT = (By.ID, "password")
    CREATE_ACCOUNT_BUTTON = (By.XPATH, "//button[normalize-space()='Create Account']")
    CREATING_ACCOUNT_BUTTON = (By.XPATH, "//button[contains(text(),'Creating account')]")

    # Waitlist form locators
    WAITLIST_NAME_INPUT = (By.ID, "waitlistName")
    WAITLIST_EMAIL_INPUT = (By.ID, "waitlistEmail")
    JOIN_WAITLIST_BUTTON = (By.XPATH, "//button[normalize-space()='Join Waitlist']")
    JOINING_BUTTON = (By.XPATH, "//button[contains(text(),'Joining')]")
    WAITLIST_LINK = (By.XPATH, "//button[contains(text(),'Join the waitlist')]")

    # Navigation
    SIGN_IN_LINK = (By.XPATH, "//a[contains(text(),'Sign in')]")

    # Success
    SUCCESS_HEADING = (By.XPATH, "//*[contains(text(),\"You're on the list\")]")
    BACK_TO_SIGNUP_BUTTON = (By.XPATH, "//button[contains(text(),'Back to Sign Up')]")

    ERROR_MESSAGE = (By.XPATH, "//*[contains(@class,'destructive')]")

    def open(self):
        self.navigate(self.PATH)
        return self

    def signup(self, invite_code: str, display_name: str, email: str, password: str):
        """Fill and submit the signup form."""
        self.fill_input("inviteCode", invite_code)
        self.fill_input("displayName", display_name)
        self.fill_input("email", email)
        self.fill_input("password", password)
        self.find_clickable(*self.CREATE_ACCOUNT_BUTTON).click()

    def join_waitlist(self, name: str, email: str):
        """Switch to waitlist mode, fill and submit."""
        self.find_clickable(*self.WAITLIST_LINK).click()
        self.fill_input("waitlistName", name)
        self.fill_input("waitlistEmail", email)
        self.find_clickable(*self.JOIN_WAITLIST_BUTTON).click()

    def is_success_visible(self) -> bool:
        return self.is_element_present(*self.SUCCESS_HEADING)

    def get_error(self) -> str:
        return self.find_visible(*self.ERROR_MESSAGE).text

    def go_to_login(self):
        self.find_clickable(*self.SIGN_IN_LINK).click()
        self.wait_for_url("/login")
