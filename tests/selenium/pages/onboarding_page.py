"""Page object for the Onboarding flow (/onboarding)."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class OnboardingPage(BasePage):
    """Encapsulates interactions with the multi-step onboarding flow."""

    PATH = "/onboarding"

    # Step 1: Welcome
    WELCOME_HEADING = (By.XPATH, "//*[contains(text(),'Welcome')]")
    START_BUTTON = (By.XPATH, "//button[contains(.,'Start') or contains(.,'Get Started') or contains(.,'Next')]")

    # Step 2: Upload
    UPLOAD_FILE_INPUT = (By.XPATH, "//input[@type='file']")
    SKIP_UPLOAD_BUTTON = (By.XPATH, "//button[contains(.,'Skip')]")

    # Step 3: Processing
    PROCESSING_INDICATOR = (By.XPATH, "//*[contains(text(),'Processing') or contains(text(),'Analyzing')]")
    SKIP_REVIEW_BUTTON = (By.XPATH, "//button[contains(.,'Skip')]")

    # Step 4: Review
    REVIEW_HEADING = (By.XPATH, "//*[contains(text(),'Review')]")
    NEXT_BUTTON = (By.XPATH, "//button[contains(.,'Next') or contains(.,'Continue')]")

    # Step 5: Complete
    COMPLETE_HEADING = (By.XPATH, "//*[contains(text(),'Complete') or contains(text(),'ready') or contains(text(),'Done')]")
    GO_TO_DASHBOARD_BUTTON = (By.XPATH, "//button[contains(.,'Dashboard') or contains(.,'Go to Dashboard')]")

    # Progress
    STEP_INDICATORS = (By.XPATH, "//*[contains(@class,'step') or contains(@class,'progress')]")

    def open(self):
        self.navigate(self.PATH)
        return self

    def is_on_welcome_step(self) -> bool:
        return self.is_element_present(*self.WELCOME_HEADING)

    def click_start(self):
        self.find_clickable(*self.START_BUTTON).click()

    def skip_upload(self):
        self.find_clickable(*self.SKIP_UPLOAD_BUTTON).click()

    def upload_statement(self, file_path: str):
        import os
        file_input = self.find(By.XPATH, "//input[@type='file']")
        file_input.send_keys(os.path.abspath(file_path))

    def is_processing(self) -> bool:
        return self.is_element_present(*self.PROCESSING_INDICATOR)

    def skip_review(self):
        self.find_clickable(*self.SKIP_REVIEW_BUTTON).click()

    def click_next(self):
        self.find_clickable(*self.NEXT_BUTTON).click()

    def is_complete(self) -> bool:
        return self.is_element_present(*self.COMPLETE_HEADING)

    def go_to_dashboard(self):
        self.find_clickable(*self.GO_TO_DASHBOARD_BUTTON).click()
        self.wait_for_url("/dashboard")
