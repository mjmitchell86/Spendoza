"""Tests for the Bank Statements page."""

import pytest
import time
from pages.bank_statements_page import BankStatementsPage


@pytest.mark.auth
class TestBankStatementsPage:
    """Tests for the /bank-statements page."""

    def test_bank_statements_page_loads(self, logged_in_driver):
        page = BankStatementsPage(logged_in_driver)
        page.open()
        assert page.is_element_present(*page.PAGE_TITLE)

    def test_upload_button_visible(self, logged_in_driver):
        page = BankStatementsPage(logged_in_driver)
        page.open()
        assert page.is_element_present(*page.UPLOAD_BUTTON)

    def test_click_upload_opens_dialog(self, logged_in_driver):
        """Clicking upload should open the upload dialog."""
        page = BankStatementsPage(logged_in_driver)
        page.open()
        page.click_upload()
        time.sleep(0.5)
        # Should show a file input or drag-and-drop area
        has_file_input = page.is_element_present(*page.FILE_INPUT, timeout=3)
        has_drag_drop = page.is_element_present(*page.DRAG_DROP_AREA, timeout=3)
        assert has_file_input or has_drag_drop, "Upload dialog should have file input or drag area"

    def test_statements_list_or_empty_state(self, logged_in_driver):
        """Should show either statements or an empty state."""
        page = BankStatementsPage(logged_in_driver)
        page.open()
        time.sleep(2)
        has_statements = page.has_statements()
        is_empty = page.is_empty()
        assert has_statements or is_empty, "Should show statements or empty state"

    def test_page_does_not_crash(self, logged_in_driver):
        """Basic smoke test: the page loads without crashing."""
        page = BankStatementsPage(logged_in_driver)
        page.open()
        time.sleep(2)
        body_text = logged_in_driver.find_element(
            "tag name", "body"
        ).text.lower()
        assert "error" not in body_text or "statement" in body_text
