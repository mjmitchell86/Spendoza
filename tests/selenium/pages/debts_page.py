"""Page object for the Debts page (/debts)."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class DebtsPage(BasePage):
    """Encapsulates interactions with the debts page."""

    PATH = "/debts"

    # Header
    PAGE_TITLE = (By.XPATH, "//h1[normalize-space()='Debts']")
    ADD_DEBT_BUTTON = (By.XPATH, "//button[contains(.,'Add Debt')]")

    # Summary cards
    TOTAL_DEBT_CARD = (By.XPATH, "//*[contains(text(),'Total Debt')]")
    MONTHLY_PAYMENTS_CARD = (By.XPATH, "//*[contains(text(),'Monthly Payments')]")
    HIGHEST_RATE_CARD = (By.XPATH, "//*[contains(text(),'Highest Rate')]")

    # Debt form dialog
    DEBT_NAME_INPUT = (By.ID, "debt_name")
    ORIGINAL_BALANCE_INPUT = (By.ID, "debt_original_balance")
    CURRENT_BALANCE_INPUT = (By.ID, "debt_current_balance")
    INTEREST_RATE_INPUT = (By.ID, "debt_interest_rate")
    MINIMUM_PAYMENT_INPUT = (By.ID, "debt_minimum_payment")
    DUE_DATE_DAY_INPUT = (By.ID, "debt_due_date_day")
    CANCEL_BUTTON = (By.XPATH, "//button[normalize-space()='Cancel']")

    # Sections
    PAYOFF_PROJECTIONS = (By.XPATH, "//*[contains(text(),'Payoff')]")

    # Empty state
    EMPTY_STATE = (By.XPATH, "//*[contains(text(),'No debts tracked')]")
    ADD_FIRST_DEBT_BUTTON = (By.XPATH, "//button[contains(.,'Add Your First Debt')]")

    def open(self):
        self.navigate(self.PATH)
        self.find_visible(*self.PAGE_TITLE)
        return self

    def click_add_debt(self):
        self.find_clickable(*self.ADD_DEBT_BUTTON).click()

    def fill_debt_form(
        self,
        name: str,
        debt_type: str | None = None,
        original_balance: str | None = None,
        current_balance: str = "0",
        interest_rate: str = "0",
        minimum_payment: str = "0",
        due_date_day: str | None = None,
    ):
        """Fill the add/edit debt dialog form."""
        self.fill_input("debt_name", name)
        if debt_type:
            self.select_option_in_form("Type", debt_type)
        if original_balance:
            self.fill_input("debt_original_balance", original_balance)
        self.fill_input("debt_current_balance", current_balance)
        self.fill_input("debt_interest_rate", interest_rate)
        self.fill_input("debt_minimum_payment", minimum_payment)
        if due_date_day:
            self.fill_input("debt_due_date_day", due_date_day)

    def submit_debt_form(self):
        self.find_clickable(
            By.XPATH,
            "//button[@type='submit'][normalize-space()='Add Debt' or normalize-space()='Update']"
        ).click()

    def cancel_form(self):
        self.find_clickable(*self.CANCEL_BUTTON).click()

    def is_debt_listed(self, name: str) -> bool:
        return self.is_text_present(name)

    def is_empty(self) -> bool:
        return self.is_element_present(*self.EMPTY_STATE)

    def click_edit_debt(self, name: str):
        card = self.find(
            By.XPATH,
            f"//*[contains(text(),'{name}')]/ancestor::*[contains(@class,'card')]"
        )
        edit_btn = card.find_element(By.XPATH, ".//button[contains(.,'Edit')]")
        edit_btn.click()

    def click_delete_debt(self, name: str):
        card = self.find(
            By.XPATH,
            f"//*[contains(text(),'{name}')]/ancestor::*[contains(@class,'card')]"
        )
        delete_btn = card.find_element(By.XPATH, ".//button[contains(.,'Delete')]")
        delete_btn.click()

    def confirm_delete(self):
        self.find_clickable(
            By.XPATH,
            "//button[normalize-space()='Delete' or normalize-space()='Confirm']"
        ).click()
