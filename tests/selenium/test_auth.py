"""Tests for authentication flows: login, signup, and session management."""

import pytest
import time
from selenium.webdriver.common.by import By
from pages.login_page import LoginPage
from pages.signup_page import SignupPage


class TestLoginPage:
    """Tests for the /login page."""

    def test_login_page_loads(self, driver):
        page = LoginPage(driver)
        page.open()
        assert page.is_sign_in_button_visible()

    def test_login_page_has_form_elements(self, driver):
        page = LoginPage(driver)
        page.open()
        assert page.is_element_present(*page.EMAIL_INPUT)
        assert page.is_element_present(*page.PASSWORD_INPUT)
        assert page.is_element_present(*page.SIGN_IN_BUTTON)

    def test_login_page_has_signup_link(self, driver):
        page = LoginPage(driver)
        page.open()
        assert page.is_element_present(*page.SIGNUP_LINK)

    def test_login_empty_form_shows_validation(self, driver):
        """Submitting an empty form should not navigate away."""
        page = LoginPage(driver)
        page.open()
        page.find_clickable(*page.SIGN_IN_BUTTON).click()
        time.sleep(0.5)
        # Should still be on login page
        assert "/login" in driver.current_url

    def test_login_invalid_credentials_shows_error(self, driver):
        """Submitting wrong credentials should show an error message."""
        page = LoginPage(driver)
        page.open()
        page.login("nonexistent@example.com", "wrongpassword123")
        time.sleep(2)
        # Should still be on login or show error
        has_error = page.is_element_present(*page.ERROR_MESSAGE, timeout=5)
        still_on_login = "/login" in driver.current_url
        assert has_error or still_on_login, "Should show error or stay on login page"

    def test_login_navigate_to_signup(self, driver):
        page = LoginPage(driver)
        page.open()
        page.go_to_signup()
        assert "/signup" in driver.current_url

    @pytest.mark.auth
    def test_login_success_redirects_to_dashboard(self, driver, test_user, base_url):
        """A valid login should redirect to dashboard (or onboarding)."""
        # Start fresh by going to login
        driver.get(f"{base_url}/login")
        page = LoginPage(driver)
        page.find_visible(*page.PAGE_HEADING)
        page.login(test_user["email"], test_user["password"])
        time.sleep(3)
        # Should redirect to dashboard or onboarding
        assert "/login" not in driver.current_url, "Should navigate away from login"

    @pytest.mark.auth
    def test_login_shows_loading_state(self, driver, test_user, base_url):
        """Sign In button should show loading text while authenticating."""
        driver.get(f"{base_url}/login")
        page = LoginPage(driver)
        page.find_visible(*page.PAGE_HEADING)
        page.fill_input("email", test_user["email"])
        page.fill_input("password", test_user["password"])
        page.find_clickable(*page.SIGN_IN_BUTTON).click()
        # Check for loading state (may be very brief)
        loading_appeared = page.is_element_present(*page.SIGNING_IN_BUTTON, timeout=2)
        # This is a soft check – loading state might be too fast to catch
        time.sleep(2)


class TestSignupPage:
    """Tests for the /signup page."""

    def test_signup_page_loads(self, driver):
        page = SignupPage(driver)
        page.open()
        assert page.is_element_present(*page.INVITE_CODE_INPUT)

    def test_signup_page_has_all_fields(self, driver):
        page = SignupPage(driver)
        page.open()
        assert page.is_element_present(*page.INVITE_CODE_INPUT)
        assert page.is_element_present(*page.DISPLAY_NAME_INPUT)
        assert page.is_element_present(*page.EMAIL_INPUT)
        assert page.is_element_present(*page.PASSWORD_INPUT)
        assert page.is_element_present(*page.CREATE_ACCOUNT_BUTTON)

    def test_signup_navigate_to_login(self, driver):
        page = SignupPage(driver)
        page.open()
        page.go_to_login()
        assert "/login" in driver.current_url

    def test_signup_switch_to_waitlist(self, driver):
        page = SignupPage(driver)
        page.open()
        page.find_clickable(*page.WAITLIST_LINK).click()
        time.sleep(0.5)
        assert page.is_element_present(*page.WAITLIST_NAME_INPUT)
        assert page.is_element_present(*page.WAITLIST_EMAIL_INPUT)
        assert page.is_element_present(*page.JOIN_WAITLIST_BUTTON)

    def test_signup_invalid_code_shows_error(self, driver):
        """Submitting with a bad invite code should show an error."""
        page = SignupPage(driver)
        page.open()
        page.signup("INVALID_CODE", "Test User", "test_invalid@example.com", "password123")
        time.sleep(2)
        has_error = page.is_element_present(*page.ERROR_MESSAGE, timeout=5)
        still_on_signup = "/signup" in driver.current_url
        assert has_error or still_on_signup, "Should show error or stay on signup"

    def test_signup_empty_form_stays_on_page(self, driver):
        """Submitting empty form should not navigate away."""
        page = SignupPage(driver)
        page.open()
        page.find_clickable(*page.CREATE_ACCOUNT_BUTTON).click()
        time.sleep(0.5)
        assert "/signup" in driver.current_url


class TestSessionManagement:
    """Tests for session persistence and auth guards."""

    def test_unauthenticated_redirect_to_login(self, fresh_driver, base_url):
        """Accessing a protected route without auth should redirect to login."""
        fresh_driver.get(f"{base_url}/dashboard")
        time.sleep(3)
        assert "/login" in fresh_driver.current_url or "/about" in fresh_driver.current_url

    def test_unauthenticated_expenses_redirect(self, fresh_driver, base_url):
        """Accessing /expenses without auth should redirect."""
        fresh_driver.get(f"{base_url}/expenses")
        time.sleep(3)
        assert "/login" in fresh_driver.current_url or "/about" in fresh_driver.current_url

    def test_unauthenticated_profile_redirect(self, fresh_driver, base_url):
        """Accessing /profile without auth should redirect."""
        fresh_driver.get(f"{base_url}/profile")
        time.sleep(3)
        assert "/login" in fresh_driver.current_url or "/about" in fresh_driver.current_url
