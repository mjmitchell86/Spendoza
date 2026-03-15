"""Page objects for public (unauthenticated) pages."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class AboutPage(BasePage):
    """Page object for the About / landing page (/about)."""

    PATH = "/about"

    PAGE_HEADING = (By.TAG_NAME, "h1")
    FEATURES_SECTION = (By.XPATH, "//*[contains(text(),'Features') or contains(text(),'features')]")
    GET_STARTED_BUTTON = (By.XPATH, "//a[contains(.,'Get Started')] | //button[contains(.,'Get Started')]")
    SIGN_UP_BUTTON = (By.XPATH, "//a[contains(.,'Sign Up')] | //button[contains(.,'Sign Up')]")
    LOGIN_LINK = (By.XPATH, "//a[contains(.,'Sign In') or contains(.,'Log In') or contains(@href,'/login')]")

    def open(self):
        self.navigate(self.PATH)
        return self

    def has_heading(self) -> bool:
        return self.is_element_present(*self.PAGE_HEADING)

    def has_features(self) -> bool:
        return self.is_element_present(*self.FEATURES_SECTION)

    def click_get_started(self):
        self.find_clickable(*self.GET_STARTED_BUTTON).click()

    def click_login(self):
        self.find_clickable(*self.LOGIN_LINK).click()
        self.wait_for_url("/login")


class PricingPage(BasePage):
    """Page object for the Pricing page (/pricing)."""

    PATH = "/pricing"

    PAGE_HEADING = (By.XPATH, "//h1[contains(text(),'Pricing') or contains(text(),'Plans')]")
    FREE_PLAN = (By.XPATH, "//*[contains(text(),'Free')]")
    STARTER_PLAN = (By.XPATH, "//*[contains(text(),'Starter')]")
    PRO_PLAN = (By.XPATH, "//*[contains(text(),'Pro')]")
    SUBSCRIBE_BUTTONS = (By.XPATH, "//button[contains(.,'Subscribe') or contains(.,'Get Started') or contains(.,'Sign Up')]")
    CURRENT_PLAN_BADGE = (By.XPATH, "//*[contains(text(),'Current Plan') or contains(text(),'current')]")

    def open(self):
        self.navigate(self.PATH)
        return self

    def has_heading(self) -> bool:
        return self.is_element_present(*self.PAGE_HEADING)

    def has_all_plans(self) -> bool:
        return (
            self.is_element_present(*self.FREE_PLAN)
            and self.is_element_present(*self.STARTER_PLAN)
            and self.is_element_present(*self.PRO_PLAN)
        )

    def get_plan_count(self) -> int:
        buttons = self.find_all(*self.SUBSCRIBE_BUTTONS)
        return len(buttons)


class GettingStartedPage(BasePage):
    """Page object for the Getting Started guide page (/getting-started)."""

    PATH = "/getting-started"

    PAGE_HEADING = (By.XPATH, "//h1[contains(text(),'Getting Started') or contains(text(),'getting started')]")
    STEPS = (By.XPATH, "//h2 | //h3")

    def open(self):
        self.navigate(self.PATH)
        return self

    def has_heading(self) -> bool:
        return self.is_element_present(*self.PAGE_HEADING)

    def get_step_count(self) -> int:
        steps = self.find_all(*self.STEPS)
        return len(steps)
