"""Page object for the Dashboard page (/dashboard)."""

from selenium.webdriver.common.by import By
from .base_page import BasePage


class DashboardPage(BasePage):
    """Encapsulates interactions with the personal dashboard."""

    PATH = "/dashboard"

    # Header
    PAGE_TITLE = (By.XPATH, "//h1[normalize-space()='Dashboard']")
    REFRESH_BUTTON = (By.XPATH, "//button[contains(.,'Refresh Report')]")
    EXPORT_PDF_BUTTON = (By.XPATH, "//button[contains(.,'Export PDF')]")

    # Summary cards
    TOTAL_INCOME_CARD = (By.XPATH, "//*[contains(text(),'Total Income')]")
    TOTAL_EXPENSES_CARD = (By.XPATH, "//*[contains(text(),'Total Expenses')]")
    NET_CARD = (By.XPATH, "//*[contains(text(),'Net')]")

    # Sections
    HEALTH_SCORE_SECTION = (By.XPATH, "//*[contains(text(),'Financial Health')]")
    INCOME_VS_EXPENSES_CHART = (By.XPATH, "//*[contains(text(),'Income vs Expenses')]")
    SPENDING_CHART = (By.XPATH, "//*[contains(text(),'Spending by Category')]")
    TOP_EXPENSES = (By.XPATH, "//*[contains(text(),'Top Expenses')]")
    UPCOMING_BILLS = (By.XPATH, "//*[contains(text(),'Upcoming Bills')]")
    AI_INSIGHTS = (By.XPATH, "//*[contains(text(),'AI Insights')]")

    # Processing banner
    PROCESSING_BANNER = (By.XPATH, "//*[contains(text(),'currently processing')]")

    def open(self):
        self.navigate(self.PATH)
        self.find_visible(*self.PAGE_TITLE)
        return self

    def is_loaded(self) -> bool:
        return self.is_element_present(*self.PAGE_TITLE)

    def has_summary_cards(self) -> bool:
        return (
            self.is_element_present(*self.TOTAL_INCOME_CARD)
            and self.is_element_present(*self.TOTAL_EXPENSES_CARD)
        )

    def click_refresh(self):
        self.find_clickable(*self.REFRESH_BUTTON).click()

    def click_export_pdf(self):
        self.find_clickable(*self.EXPORT_PDF_BUTTON).click()

    def has_health_score(self) -> bool:
        return self.is_element_present(*self.HEALTH_SCORE_SECTION)

    def has_charts(self) -> bool:
        return (
            self.is_element_present(*self.INCOME_VS_EXPENSES_CHART)
            or self.is_element_present(*self.SPENDING_CHART)
        )

    def has_processing_banner(self) -> bool:
        return self.is_element_present(*self.PROCESSING_BANNER, timeout=2)

    def get_summary_card_value(self, card_label: str) -> str:
        """Get the displayed value next to a summary card label."""
        card = self.find(
            By.XPATH,
            f"//*[contains(text(),'{card_label}')]/ancestor::*[contains(@class,'card')]"
        )
        # The value is typically in a large text element
        value_el = card.find_element(
            By.XPATH, ".//*[contains(@class,'text-2xl') or contains(@class,'text-xl')]"
        )
        return value_el.text
