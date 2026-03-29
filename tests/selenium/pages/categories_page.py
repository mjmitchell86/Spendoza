"""Page object for the Categories page (/categories)."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class CategoriesPage(BasePage):
    """Encapsulates interactions with the categories page."""

    PATH = "/categories"

    # Header
    PAGE_TITLE = (By.XPATH, "//h1[normalize-space()='Categories']")
    NEW_CATEGORY_BUTTON = (By.XPATH, "//button[contains(.,'New Category')]")

    # Category form dialog
    CATEGORY_NAME_INPUT = (By.ID, "category_name")
    IS_SHARED_SWITCH = (By.ID, "is_shared")
    CANCEL_BUTTON = (By.XPATH, "//button[normalize-space()='Cancel']")
    CREATE_BUTTON = (By.XPATH, "//button[normalize-space()='Create Category']")
    UPDATE_BUTTON = (By.XPATH, "//button[normalize-space()='Update']")

    def open(self):
        self.navigate(self.PATH)
        self.find_visible(*self.PAGE_TITLE)
        return self

    def click_new_category(self):
        self.find_clickable(*self.NEW_CATEGORY_BUTTON).click()

    def fill_category_form(self, name: str, budget_class: str | None = None):
        """Fill the create/edit category dialog."""
        self.fill_input("category_name", name)
        if budget_class:
            self.select_option_in_form("Budget Class", budget_class)

    def submit_create(self):
        self.find_clickable(*self.CREATE_BUTTON).click()

    def submit_update(self):
        self.find_clickable(*self.UPDATE_BUTTON).click()

    def cancel_form(self):
        self.find_clickable(*self.CANCEL_BUTTON).click()

    def is_category_listed(self, name: str) -> bool:
        return self.is_text_present(name)

    def click_edit_category(self, name: str):
        card = self.find(
            By.XPATH,
            f"//*[contains(text(),'{name}')]/ancestor::*[contains(@class,'card')]"
        )
        edit_btn = card.find_element(
            By.XPATH, ".//button[contains(.,'Edit')]"
        )
        edit_btn.click()

    def click_delete_category(self, name: str):
        card = self.find(
            By.XPATH,
            f"//*[contains(text(),'{name}')]/ancestor::*[contains(@class,'card')]"
        )
        delete_btn = card.find_element(
            By.XPATH, ".//button[contains(.,'Delete')]"
        )
        delete_btn.click()

    def confirm_delete(self):
        """Confirm the delete action in the confirmation dialog."""
        self.find_clickable(
            By.XPATH,
            "//button[normalize-space()='Delete' or normalize-space()='Confirm']"
        ).click()

    def get_category_names(self) -> list[str]:
        cards = self.find_all(
            By.XPATH,
            "//*[contains(@class,'card')]//*[contains(@class,'font-medium') or contains(@class,'font-semibold')]"
        )
        return [c.text for c in cards if c.text]
