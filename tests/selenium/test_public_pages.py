"""Tests for public (unauthenticated) pages: About, Pricing, Getting Started."""

import pytest
from selenium.webdriver.common.by import By
from pages.public_pages import AboutPage, PricingPage, GettingStartedPage


@pytest.mark.public
class TestAboutPage:
    """Tests for the /about landing page."""

    def test_about_page_loads(self, driver):
        page = AboutPage(driver)
        page.open()
        assert page.has_heading()

    def test_about_page_shows_features(self, driver):
        page = AboutPage(driver)
        page.open()
        assert page.has_features()

    def test_about_page_has_cta_buttons(self, driver):
        page = AboutPage(driver)
        page.open()
        # Should have at least a get started or sign up call-to-action
        has_cta = (
            page.is_element_present(*page.GET_STARTED_BUTTON, timeout=3)
            or page.is_element_present(*page.SIGN_UP_BUTTON, timeout=3)
        )
        assert has_cta, "About page should have a CTA button"

    def test_about_login_link_navigates(self, driver):
        page = AboutPage(driver)
        page.open()
        if page.is_element_present(*page.LOGIN_LINK, timeout=3):
            page.click_login()
            assert "/login" in driver.current_url

    def test_root_redirects_to_about(self, driver):
        page = AboutPage(driver)
        page.navigate("/")
        page.wait_for_url("/about", timeout=5)
        assert "/about" in driver.current_url


@pytest.mark.public
class TestPricingPage:
    """Tests for the /pricing page."""

    def test_pricing_page_loads(self, driver):
        page = PricingPage(driver)
        page.open()
        assert page.has_heading()

    def test_pricing_shows_all_plans(self, driver):
        page = PricingPage(driver)
        page.open()
        assert page.has_all_plans()

    def test_pricing_has_subscribe_buttons(self, driver):
        page = PricingPage(driver)
        page.open()
        count = page.get_plan_count()
        assert count >= 1, "Should have at least one subscribe/CTA button"


@pytest.mark.public
class TestGettingStartedPage:
    """Tests for the /getting-started guide page."""

    def test_getting_started_page_loads(self, driver):
        page = GettingStartedPage(driver)
        page.open()
        assert page.has_heading()

    def test_getting_started_has_steps(self, driver):
        page = GettingStartedPage(driver)
        page.open()
        count = page.get_step_count()
        assert count >= 1, "Getting started page should have at least one step"
