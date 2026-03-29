"""Page object for the Goals page (/goals)."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class GoalsPage(BasePage):
    """Encapsulates interactions with the goals page."""

    PATH = "/goals"

    # Header
    PAGE_TITLE = (By.XPATH, "//h1[normalize-space()='Goals']")
    ADD_GOAL_BUTTON = (By.XPATH, "//button[contains(.,'Add Goal')]")

    # Summary cards
    TOTAL_GOALS_CARD = (By.XPATH, "//*[contains(text(),'Total Goals')]")
    ON_TRACK_CARD = (By.XPATH, "//*[contains(text(),'On Track')]")
    NEEDS_ATTENTION_CARD = (By.XPATH, "//*[contains(text(),'Needs Attention')]")

    # Goal form dialog
    GOAL_NAME_INPUT = (By.ID, "goal_name")
    GOAL_TARGET_INPUT = (By.ID, "goal_target")
    GOAL_TARGET_DATE_INPUT = (By.ID, "goal_target_date")
    CANCEL_BUTTON = (By.XPATH, "//button[normalize-space()='Cancel']")

    # Sections
    SUGGESTED_GOALS = (By.XPATH, "//*[contains(text(),'Suggested Goals')]")
    GOAL_CARDS = (By.XPATH, "//*[contains(@class,'card')]//h3")

    # Empty state
    EMPTY_STATE = (By.XPATH, "//*[contains(text(),'No goals yet')]")
    ADD_FIRST_GOAL_BUTTON = (By.XPATH, "//button[contains(.,'Add Your First Goal')]")

    def open(self):
        self.navigate(self.PATH)
        self.find_visible(*self.PAGE_TITLE)
        return self

    def click_add_goal(self):
        self.find_clickable(*self.ADD_GOAL_BUTTON).click()

    def fill_goal_form(
        self,
        name: str,
        target: str,
        goal_type: str | None = None,
        target_date: str | None = None,
        category: str | None = None,
    ):
        """Fill the add/edit goal dialog form."""
        self.fill_input("goal_name", name)
        if goal_type:
            self.select_option_in_form("Type", goal_type)
        self.fill_input("goal_target", target)
        if target_date:
            self.fill_input("goal_target_date", target_date)
        if category:
            self.select_option_in_form("Category", category)

    def submit_goal_form(self):
        self.find_clickable(
            By.XPATH,
            "//button[@type='submit'][normalize-space()='Add Goal' or normalize-space()='Update']"
        ).click()

    def cancel_form(self):
        self.find_clickable(*self.CANCEL_BUTTON).click()

    def is_goal_listed(self, name: str) -> bool:
        return self.is_text_present(name)

    def is_empty(self) -> bool:
        return self.is_element_present(*self.EMPTY_STATE)

    def get_goal_names(self) -> list[str]:
        cards = self.find_all(*self.GOAL_CARDS)
        return [c.text for c in cards if c.text]

    def click_edit_goal(self, name: str):
        card = self.find(
            By.XPATH,
            f"//*[contains(text(),'{name}')]/ancestor::*[contains(@class,'card')]"
        )
        edit_btn = card.find_element(By.XPATH, ".//button[contains(.,'Edit')]")
        edit_btn.click()

    def click_delete_goal(self, name: str):
        card = self.find(
            By.XPATH,
            f"//*[contains(text(),'{name}')]/ancestor::*[contains(@class,'card')]"
        )
        delete_btn = card.find_element(By.XPATH, ".//button[contains(.,'Delete')]")
        delete_btn.click()

    def click_log_savings(self, name: str):
        card = self.find(
            By.XPATH,
            f"//*[contains(text(),'{name}')]/ancestor::*[contains(@class,'card')]"
        )
        log_btn = card.find_element(By.XPATH, ".//button[contains(.,'Log')]")
        log_btn.click()

    def confirm_delete(self):
        self.find_clickable(
            By.XPATH,
            "//button[normalize-space()='Delete' or normalize-space()='Confirm']"
        ).click()
