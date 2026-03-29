"""Page object for the Expenses page (/expenses)."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class ExpensesPage(BasePage):
    """Encapsulates interactions with the expenses page."""

    PATH = "/expenses"

    # Header
    PAGE_TITLE = (By.XPATH, "//h1[normalize-space()='Expenses']")
    ADD_EXPENSE_BUTTON = (By.XPATH, "//button[contains(.,'Add Expense')]")

    # Filter bar
    SEARCH_INPUT = (By.XPATH, "//input[@placeholder='Search merchants...']")
    CLEAR_FILTERS_BUTTON = (By.XPATH, "//button[contains(text(),'Clear filters')]")

    # Summary cards
    TOTAL_EXPENSES_CARD = (By.XPATH, "//*[contains(text(),'Total Expenses')]")

    # Sections
    RECURRING_EXPENSES_SECTION = (By.XPATH, "//*[contains(text(),'Recurring Expenses')]")
    BANK_TRANSACTIONS_SECTION = (By.XPATH, "//*[contains(text(),'Bank Transactions')]")

    # Expense form dialog
    DIALOG_TITLE_ADD = (By.XPATH, "//*[contains(text(),'Add Expense')]")
    DIALOG_TITLE_EDIT = (By.XPATH, "//*[contains(text(),'Edit Expense')]")
    DESCRIPTION_INPUT = (By.ID, "description")
    FRIENDLY_NAME_INPUT = (By.ID, "friendly_name")
    AMOUNT_INPUT = (By.ID, "expense_amount")
    NEXT_DUE_DATE_INPUT = (By.ID, "next_due_date")
    END_DATE_INPUT = (By.ID, "expense_end_date")
    CANCEL_BUTTON = (By.XPATH, "//button[normalize-space()='Cancel']")
    SAVE_BUTTON = (By.XPATH, "//button[normalize-space()='Add Expense' and @type='submit']")
    UPDATE_BUTTON = (By.XPATH, "//button[normalize-space()='Update']")

    # Empty state
    EMPTY_STATE = (By.XPATH, "//*[contains(text(),'No recurring expenses')]")

    def open(self):
        self.navigate(self.PATH)
        self.find_visible(*self.PAGE_TITLE)
        return self

    def click_add_expense(self):
        self.find_clickable(*self.ADD_EXPENSE_BUTTON).click()

    def fill_expense_form(
        self,
        description: str,
        amount: str,
        due_date: str,
        category: str | None = None,
        friendly_name: str | None = None,
    ):
        """Fill the add/edit expense dialog form."""
        self.fill_input("description", description)
        if friendly_name:
            self.fill_input("friendly_name", friendly_name)
        self.fill_input("expense_amount", amount)
        if category:
            self.select_option_in_form("Category", category)
        self.fill_input("next_due_date", due_date)

    def submit_expense_form(self):
        self.find_clickable(
            By.XPATH,
            "//button[@type='submit'][normalize-space()='Add Expense' or normalize-space()='Update']"
        ).click()

    def cancel_form(self):
        self.find_clickable(*self.CANCEL_BUTTON).click()

    def search_merchants(self, query: str):
        el = self.find_visible(*self.SEARCH_INPUT)
        el.clear()
        el.send_keys(query)

    def clear_filters(self):
        self.find_clickable(*self.CLEAR_FILTERS_BUTTON).click()

    def has_recurring_expenses(self) -> bool:
        return self.is_element_present(*self.RECURRING_EXPENSES_SECTION)

    def get_expense_items(self) -> list:
        """Return text of all expense list items in the recurring section."""
        items = self.find_all(
            By.XPATH,
            "//*[contains(text(),'Recurring Expenses')]/ancestor::*[contains(@class,'card')]//li"
        )
        return [item.text for item in items]

    def is_expense_listed(self, name: str) -> bool:
        return self.is_text_present(name)

    def click_edit_expense(self, name: str):
        """Click edit on a specific expense by name."""
        row = self.find(
            By.XPATH,
            f"//*[contains(text(),'{name}')]/ancestor::li"
        )
        edit_btn = row.find_element(By.XPATH, ".//button[contains(@aria-label,'Edit') or contains(.,'Edit')]")
        edit_btn.click()

    def click_delete_expense(self, name: str):
        """Click delete on a specific expense by name."""
        row = self.find(
            By.XPATH,
            f"//*[contains(text(),'{name}')]/ancestor::li"
        )
        delete_btn = row.find_element(By.XPATH, ".//button[contains(@aria-label,'Delete') or contains(.,'Delete')]")
        delete_btn.click()
