"""Base page object with common helpers for all pages."""

from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException


class BasePage:
    """Base class for all page objects."""

    BASE_URL = "http://localhost:5173"
    DEFAULT_TIMEOUT = 10

    def __init__(self, driver: WebDriver):
        self.driver = driver
        self.wait = WebDriverWait(driver, self.DEFAULT_TIMEOUT)

    def navigate(self, path: str = "/"):
        self.driver.get(f"{self.BASE_URL}{path}")

    def find(self, by: str, value: str, timeout: int | None = None) -> WebElement:
        wait = WebDriverWait(self.driver, timeout or self.DEFAULT_TIMEOUT)
        return wait.until(EC.presence_of_element_located((by, value)))

    def find_visible(self, by: str, value: str, timeout: int | None = None) -> WebElement:
        wait = WebDriverWait(self.driver, timeout or self.DEFAULT_TIMEOUT)
        return wait.until(EC.visibility_of_element_located((by, value)))

    def find_clickable(self, by: str, value: str, timeout: int | None = None) -> WebElement:
        wait = WebDriverWait(self.driver, timeout or self.DEFAULT_TIMEOUT)
        return wait.until(EC.element_to_be_clickable((by, value)))

    def find_all(self, by: str, value: str) -> list[WebElement]:
        return self.driver.find_elements(by, value)

    def click_button(self, text: str, timeout: int | None = None):
        """Click a button by its visible text."""
        btn = self.find_clickable(
            By.XPATH, f"//button[normalize-space()='{text}']", timeout
        )
        btn.click()

    def click_link(self, text: str, timeout: int | None = None):
        """Click a link by its visible text."""
        link = self.find_clickable(
            By.XPATH, f"//a[normalize-space()='{text}']", timeout
        )
        link.click()

    def fill_input(self, input_id: str, value: str):
        """Clear and fill an input by its ID."""
        el = self.find_visible(By.ID, input_id)
        el.clear()
        el.send_keys(value)

    def fill_input_by_placeholder(self, placeholder: str, value: str):
        """Clear and fill an input by placeholder text."""
        el = self.find_visible(By.XPATH, f"//input[@placeholder='{placeholder}']")
        el.clear()
        el.send_keys(value)

    def get_input_value(self, input_id: str) -> str:
        return self.find(By.ID, input_id).get_attribute("value") or ""

    def select_option(self, trigger_text: str, option_text: str):
        """Open a shadcn Select component and choose an option.

        Clicks the trigger button that contains ``trigger_text``, then picks the
        option whose text matches ``option_text``.
        """
        trigger = self.find_clickable(
            By.XPATH,
            f"//*[@role='combobox'][contains(.,'{trigger_text}')]"
        )
        trigger.click()
        option = self.find_clickable(
            By.XPATH,
            f"//*[@role='option'][normalize-space()='{option_text}']"
        )
        option.click()

    def select_option_in_form(self, label_text: str, option_text: str):
        """Select an option in a shadcn Select that is associated with a label."""
        # Find the label, then the sibling trigger
        trigger = self.find_clickable(
            By.XPATH,
            f"//label[contains(text(),'{label_text}')]/following-sibling::*//button[@role='combobox'] | "
            f"//label[contains(text(),'{label_text}')]/..//button[@role='combobox']"
        )
        trigger.click()
        option = self.find_clickable(
            By.XPATH,
            f"//*[@role='option'][normalize-space()='{option_text}']"
        )
        option.click()

    def is_element_present(self, by: str, value: str, timeout: int = 3) -> bool:
        try:
            WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((by, value))
            )
            return True
        except TimeoutException:
            return False

    def is_text_present(self, text: str, timeout: int = 5) -> bool:
        try:
            WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located(
                    (By.XPATH, f"//*[contains(text(),'{text}')]")
                )
            )
            return True
        except TimeoutException:
            return False

    def wait_for_url(self, path: str, timeout: int | None = None):
        wait = WebDriverWait(self.driver, timeout or self.DEFAULT_TIMEOUT)
        wait.until(EC.url_contains(path))

    def wait_for_text(self, text: str, timeout: int | None = None):
        wait = WebDriverWait(self.driver, timeout or self.DEFAULT_TIMEOUT)
        wait.until(
            EC.presence_of_element_located(
                (By.XPATH, f"//*[contains(text(),'{text}')]")
            )
        )

    def wait_for_element_gone(self, by: str, value: str, timeout: int | None = None):
        wait = WebDriverWait(self.driver, timeout or self.DEFAULT_TIMEOUT)
        wait.until(EC.invisibility_of_element_located((by, value)))

    def get_page_title(self) -> str:
        """Get the text of the first h1 element on the page."""
        h1 = self.find(By.TAG_NAME, "h1")
        return h1.text

    def get_error_message(self) -> str:
        """Get error message from destructive alert."""
        el = self.find_visible(
            By.XPATH,
            "//*[contains(@class,'destructive')]"
        )
        return el.text

    def get_toast_message(self) -> str:
        """Get the text of the most recent toast notification (Sonner)."""
        toast = self.find_visible(
            By.XPATH, "//*[@data-sonner-toast]//*[@data-content]"
        )
        return toast.text

    @property
    def current_path(self) -> str:
        from urllib.parse import urlparse
        return urlparse(self.driver.current_url).path
