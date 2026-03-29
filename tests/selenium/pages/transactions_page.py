"""Page object for the Transactions page (/transactions)."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class TransactionsPage(BasePage):
    """Encapsulates interactions with the transactions page."""

    PATH = "/transactions"

    # Header
    PAGE_TITLE = (By.XPATH, "//h1[normalize-space()='Transactions']")

    # Filters
    SEARCH_INPUT = (By.XPATH, "//input[contains(@placeholder,'Search')]")
    TYPE_FILTER_ALL = (By.XPATH, "//button[normalize-space()='All']")
    TYPE_FILTER_CREDITS = (By.XPATH, "//button[normalize-space()='Credits']")
    TYPE_FILTER_DEBITS = (By.XPATH, "//button[normalize-space()='Debits']")

    # Table
    TABLE = (By.XPATH, "//table")
    TABLE_ROWS = (By.XPATH, "//table//tbody//tr")

    # Empty state
    EMPTY_STATE = (By.XPATH, "//*[contains(text(),'No transactions')]")

    def open(self):
        self.navigate(self.PATH)
        self.find_visible(*self.PAGE_TITLE)
        return self

    def search(self, query: str):
        el = self.find_visible(*self.SEARCH_INPUT)
        el.clear()
        el.send_keys(query)

    def filter_credits(self):
        self.find_clickable(*self.TYPE_FILTER_CREDITS).click()

    def filter_debits(self):
        self.find_clickable(*self.TYPE_FILTER_DEBITS).click()

    def filter_all(self):
        self.find_clickable(*self.TYPE_FILTER_ALL).click()

    def get_row_count(self) -> int:
        rows = self.find_all(*self.TABLE_ROWS)
        return len(rows)

    def get_row_text(self, index: int) -> str:
        rows = self.find_all(*self.TABLE_ROWS)
        if index < len(rows):
            return rows[index].text
        return ""

    def has_table(self) -> bool:
        return self.is_element_present(*self.TABLE)

    def is_empty(self) -> bool:
        return self.is_element_present(*self.EMPTY_STATE)

    def assign_category(self, row_index: int, category_name: str):
        """Assign a category to a transaction row via the dropdown."""
        rows = self.find_all(*self.TABLE_ROWS)
        if row_index < len(rows):
            trigger = rows[row_index].find_element(
                By.XPATH, ".//button[@role='combobox']"
            )
            trigger.click()
            option = self.find_clickable(
                By.XPATH,
                f"//*[@role='option'][normalize-space()='{category_name}']"
            )
            option.click()
