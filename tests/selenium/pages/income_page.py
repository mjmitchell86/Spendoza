"""Page object for the Income page (/income)."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class IncomePage(BasePage):
    """Encapsulates interactions with the income page."""

    PATH = "/income"

    # Header
    PAGE_TITLE = (By.XPATH, "//h1[normalize-space()='Income']")
    ADD_INCOME_BUTTON = (By.XPATH, "//button[contains(.,'Add Income')]")

    # Filter bar
    SEARCH_INPUT = (By.XPATH, "//input[@placeholder='Search sources...']")
    CLEAR_FILTERS_BUTTON = (By.XPATH, "//button[contains(text(),'Clear filters')]")

    # Summary cards
    TOTAL_INCOME_CARD = (By.XPATH, "//*[contains(text(),'Total Income')]")

    # Sections
    RECURRING_INCOME_SECTION = (By.XPATH, "//*[contains(text(),'Recurring Income')]")

    # Income form dialog
    SOURCE_NAME_INPUT = (By.ID, "source_name")
    FRIENDLY_NAME_INPUT = (By.ID, "friendly_name")
    AMOUNT_INPUT = (By.ID, "amount")
    EFFECTIVE_DATE_INPUT = (By.ID, "effective_date")
    END_DATE_INPUT = (By.ID, "end_date")
    CANCEL_BUTTON = (By.XPATH, "//button[normalize-space()='Cancel']")

    def open(self):
        self.navigate(self.PATH)
        self.find_visible(*self.PAGE_TITLE)
        return self

    def click_add_income(self):
        self.find_clickable(*self.ADD_INCOME_BUTTON).click()

    def fill_income_form(
        self,
        source_name: str,
        amount: str,
        effective_date: str,
        frequency: str | None = None,
        friendly_name: str | None = None,
    ):
        """Fill the add/edit income dialog form."""
        self.fill_input("source_name", source_name)
        if friendly_name:
            self.fill_input("friendly_name", friendly_name)
        self.fill_input("amount", amount)
        if frequency:
            self.select_option_in_form("Frequency", frequency)
        self.fill_input("effective_date", effective_date)

    def submit_income_form(self):
        self.find_clickable(
            By.XPATH,
            "//button[@type='submit'][normalize-space()='Add Income' or normalize-space()='Update']"
        ).click()

    def cancel_form(self):
        self.find_clickable(*self.CANCEL_BUTTON).click()

    def search_sources(self, query: str):
        el = self.find_visible(*self.SEARCH_INPUT)
        el.clear()
        el.send_keys(query)

    def has_recurring_income(self) -> bool:
        return self.is_element_present(*self.RECURRING_INCOME_SECTION)

    def is_income_listed(self, name: str) -> bool:
        return self.is_text_present(name)

    def click_edit_income(self, name: str):
        row = self.find(
            By.XPATH,
            f"//*[contains(text(),'{name}')]/ancestor::li"
        )
        edit_btn = row.find_element(By.XPATH, ".//button[contains(@aria-label,'Edit') or contains(.,'Edit')]")
        edit_btn.click()

    def click_delete_income(self, name: str):
        row = self.find(
            By.XPATH,
            f"//*[contains(text(),'{name}')]/ancestor::li"
        )
        delete_btn = row.find_element(By.XPATH, ".//button[contains(@aria-label,'Delete') or contains(.,'Delete')]")
        delete_btn.click()
