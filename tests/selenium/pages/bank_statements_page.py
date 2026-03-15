"""Page object for the Bank Statements page (/bank-statements)."""

import os
from selenium.webdriver.common.by import By
from .base_page import BasePage


class BankStatementsPage(BasePage):
    """Encapsulates interactions with the bank statements page."""

    PATH = "/bank-statements"

    # Header
    PAGE_TITLE = (By.XPATH, "//h1[contains(text(),'Bank Statements') or contains(text(),'Statements')]")
    UPLOAD_BUTTON = (By.XPATH, "//button[contains(.,'Upload')]")

    # Upload dialog
    FILE_INPUT = (By.XPATH, "//input[@type='file']")
    UPLOAD_SUBMIT = (By.XPATH, "//button[normalize-space()='Upload' and @type='submit']")
    DRAG_DROP_AREA = (By.XPATH, "//*[contains(text(),'drag') or contains(text(),'Drop')]")

    # Statement list
    STATEMENT_ITEMS = (By.XPATH, "//li[contains(@class,'border')] | //*[contains(@class,'card')]//li")

    # Status indicators
    STATUS_COMPLETED = (By.XPATH, "//*[contains(text(),'Completed') or contains(text(),'completed')]")
    STATUS_PROCESSING = (By.XPATH, "//*[contains(text(),'Processing') or contains(text(),'processing')]")
    STATUS_FAILED = (By.XPATH, "//*[contains(text(),'Failed') or contains(text(),'failed')]")

    # Empty state
    EMPTY_STATE = (By.XPATH, "//*[contains(text(),'No bank statements') or contains(text(),'Upload your first')]")

    def open(self):
        self.navigate(self.PATH)
        self.find_visible(*self.PAGE_TITLE)
        return self

    def click_upload(self):
        self.find_clickable(*self.UPLOAD_BUTTON).click()

    def upload_file(self, file_path: str):
        """Upload a file via the hidden file input."""
        file_input = self.find(By.XPATH, "//input[@type='file']")
        file_input.send_keys(os.path.abspath(file_path))

    def submit_upload(self):
        self.find_clickable(*self.UPLOAD_SUBMIT).click()

    def get_statement_count(self) -> int:
        items = self.find_all(*self.STATEMENT_ITEMS)
        return len(items)

    def has_statements(self) -> bool:
        return not self.is_element_present(*self.EMPTY_STATE, timeout=3)

    def is_empty(self) -> bool:
        return self.is_element_present(*self.EMPTY_STATE)

    def click_statement(self, index: int):
        """Expand/click on a statement by index."""
        items = self.find_all(*self.STATEMENT_ITEMS)
        if index < len(items):
            items[index].click()

    def click_reprocess(self, index: int = 0):
        """Click reprocess on a failed statement."""
        reprocess_btns = self.find_all(
            By.XPATH, "//button[contains(.,'Reprocess')]"
        )
        if index < len(reprocess_btns):
            reprocess_btns[index].click()

    def click_delete_statement(self, index: int = 0):
        """Click delete on a statement."""
        delete_btns = self.find_all(
            By.XPATH, "//button[contains(.,'Delete')]"
        )
        if index < len(delete_btns):
            delete_btns[index].click()
