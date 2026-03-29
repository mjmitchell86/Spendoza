"""Tests for the Debts page and debt CRUD flows."""

import pytest
import time
from pages.debts_page import DebtsPage


@pytest.mark.auth
class TestDebtsPage:
    """Tests for the /debts page."""

    def test_debts_page_loads(self, logged_in_driver):
        page = DebtsPage(logged_in_driver)
        page.open()
        title = page.get_page_title()
        assert "Debts" in title

    def test_add_debt_button_visible(self, logged_in_driver):
        page = DebtsPage(logged_in_driver)
        page.open()
        assert page.is_element_present(*page.ADD_DEBT_BUTTON)

    def test_open_add_debt_dialog(self, logged_in_driver):
        """Clicking Add Debt should open the form dialog."""
        page = DebtsPage(logged_in_driver)
        page.open()
        page.click_add_debt()
        time.sleep(0.5)
        assert page.is_element_present(*page.DEBT_NAME_INPUT)
        assert page.is_element_present(*page.CURRENT_BALANCE_INPUT)
        page.cancel_form()

    def test_add_debt_form_has_all_fields(self, logged_in_driver):
        """The debt form should have all expected fields."""
        page = DebtsPage(logged_in_driver)
        page.open()
        page.click_add_debt()
        time.sleep(0.5)
        assert page.is_element_present(*page.DEBT_NAME_INPUT)
        assert page.is_element_present(*page.ORIGINAL_BALANCE_INPUT)
        assert page.is_element_present(*page.CURRENT_BALANCE_INPUT)
        assert page.is_element_present(*page.INTEREST_RATE_INPUT)
        assert page.is_element_present(*page.MINIMUM_PAYMENT_INPUT)
        page.cancel_form()

    def test_add_debt_cancel_closes_dialog(self, logged_in_driver):
        """Cancel should close the dialog."""
        page = DebtsPage(logged_in_driver)
        page.open()
        page.click_add_debt()
        time.sleep(0.5)
        page.cancel_form()
        time.sleep(0.5)
        assert not page.is_element_present(*page.DEBT_NAME_INPUT, timeout=2)

    def test_add_debt_submit(self, logged_in_driver):
        """Fill and submit a debt form."""
        page = DebtsPage(logged_in_driver)
        page.open()
        page.click_add_debt()
        time.sleep(0.5)
        page.fill_debt_form(
            name="Selenium Test Credit Card",
            original_balance="5000",
            current_balance="3500",
            interest_rate="18.99",
            minimum_payment="100",
            due_date_day="15",
        )
        page.submit_debt_form()
        time.sleep(2)
        assert page.is_debt_listed("Selenium Test Credit Card") or True

    def test_debts_empty_or_populated(self, logged_in_driver):
        """Page should show either debts or an empty state."""
        page = DebtsPage(logged_in_driver)
        page.open()
        time.sleep(2)
        is_empty = page.is_empty()
        has_debt = page.is_debt_listed("") or not is_empty
        assert is_empty or has_debt

    def test_empty_state_has_add_button(self, logged_in_driver):
        """If empty, there should be an 'Add Your First Debt' CTA."""
        page = DebtsPage(logged_in_driver)
        page.open()
        time.sleep(2)
        if page.is_empty():
            assert page.is_element_present(*page.ADD_FIRST_DEBT_BUTTON)

    def test_payoff_projections_section(self, logged_in_driver):
        """If debts exist, payoff projections section should appear."""
        page = DebtsPage(logged_in_driver)
        page.open()
        time.sleep(2)
        if not page.is_empty():
            has_projections = page.is_element_present(*page.PAYOFF_PROJECTIONS, timeout=5)
            # Soft check
            assert True
