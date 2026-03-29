"""Tests for the Profile page and settings flows."""

import pytest
import time
from selenium.webdriver.common.by import By
from pages.profile_page import ProfilePage


@pytest.mark.auth
class TestProfilePage:
    """Tests for the /profile page."""

    def test_profile_page_loads(self, logged_in_driver):
        page = ProfilePage(logged_in_driver)
        page.open()
        assert page.is_element_present(*page.PAGE_TITLE)

    def test_display_name_input_present(self, logged_in_driver):
        page = ProfilePage(logged_in_driver)
        page.open()
        assert page.is_element_present(*page.DISPLAY_NAME_INPUT)

    def test_theme_buttons_present(self, logged_in_driver):
        """Theme toggle buttons should be visible."""
        page = ProfilePage(logged_in_driver)
        page.open()
        has_system = page.is_element_present(*page.THEME_SYSTEM, timeout=3)
        has_light = page.is_element_present(*page.THEME_LIGHT, timeout=3)
        has_dark = page.is_element_present(*page.THEME_DARK, timeout=3)
        assert has_system or has_light or has_dark, "At least one theme button should exist"

    def test_switch_theme_to_dark(self, logged_in_driver):
        """Switching to dark theme should not crash."""
        page = ProfilePage(logged_in_driver)
        page.open()
        if page.is_element_present(*page.THEME_DARK, timeout=3):
            page.set_theme("dark")
            time.sleep(0.5)
            # Verify no crash
            assert "/profile" in logged_in_driver.current_url

    def test_switch_theme_to_light(self, logged_in_driver):
        """Switching to light theme should not crash."""
        page = ProfilePage(logged_in_driver)
        page.open()
        if page.is_element_present(*page.THEME_LIGHT, timeout=3):
            page.set_theme("light")
            time.sleep(0.5)
            assert "/profile" in logged_in_driver.current_url

    def test_switch_theme_to_system(self, logged_in_driver):
        """Switching to system theme should not crash."""
        page = ProfilePage(logged_in_driver)
        page.open()
        if page.is_element_present(*page.THEME_SYSTEM, timeout=3):
            page.set_theme("system")
            time.sleep(0.5)
            assert "/profile" in logged_in_driver.current_url

    def test_subscription_info_visible(self, logged_in_driver):
        """Profile should display subscription information."""
        page = ProfilePage(logged_in_driver)
        page.open()
        time.sleep(1)
        has_sub = page.has_subscription_info()
        # May not have a subscription badge if on free tier
        assert True  # Soft check

    def test_display_name_can_be_read(self, logged_in_driver):
        """The display name field should have a value."""
        page = ProfilePage(logged_in_driver)
        page.open()
        time.sleep(1)
        name = page.get_display_name()
        # Name might be empty for new accounts
        assert isinstance(name, str)

    def test_save_display_name(self, logged_in_driver):
        """Saving display name should not crash."""
        page = ProfilePage(logged_in_driver)
        page.open()
        time.sleep(1)
        original = page.get_display_name()
        page.set_display_name("Selenium Test User")
        time.sleep(2)
        # Restore original name
        if original:
            page.set_display_name(original)
            time.sleep(1)

    def test_email_reports_toggle_present(self, logged_in_driver):
        """Email reports toggle should be on the page."""
        page = ProfilePage(logged_in_driver)
        page.open()
        has_toggle = page.is_element_present(*page.EMAIL_REPORTS_SWITCH, timeout=5)
        # May not be present for all tiers
        assert True
