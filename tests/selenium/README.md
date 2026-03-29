# Selenium UI Tests

End-to-end UI tests for Spendoza using Selenium WebDriver and pytest.

## Prerequisites

- Python 3.11+
- Chrome (or Firefox/Edge) browser installed
- The Spendoza frontend and API running locally

## Setup

```bash
cd tests/selenium

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your test user credentials
```

## Running the App Locally

From the project root:

```bash
bun run dev  # Starts both API (port 3001) and frontend (port 5173)
```

## Running Tests

```bash
# Run all tests
pytest

# Run only public page tests (no auth needed)
pytest -m public

# Run only authenticated tests
pytest -m auth

# Run a specific test file
pytest test_auth.py

# Run with HTML report
pytest --html=report.html

# Run in headed mode (see the browser)
HEADLESS=false pytest

# Use Firefox instead of Chrome
BROWSER=firefox pytest
```

## Test Structure

```
tests/selenium/
├── conftest.py              # Shared fixtures and configuration
├── pytest.ini               # Pytest settings
├── requirements.txt         # Python dependencies
├── .env.example             # Environment variable template
├── pages/                   # Page Object Model
│   ├── base_page.py         # Base class with common helpers
│   ├── login_page.py        # Login page interactions
│   ├── signup_page.py       # Signup page interactions
│   ├── dashboard_page.py    # Dashboard page interactions
│   ├── expenses_page.py     # Expenses page interactions
│   ├── income_page.py       # Income page interactions
│   ├── categories_page.py   # Categories page interactions
│   ├── transactions_page.py # Transactions page interactions
│   ├── bank_statements_page.py # Bank statements interactions
│   ├── goals_page.py        # Goals page interactions
│   ├── debts_page.py        # Debts page interactions
│   ├── profile_page.py      # Profile/settings interactions
│   ├── onboarding_page.py   # Onboarding flow interactions
│   ├── navigation.py        # Sidebar, header, nav interactions
│   └── public_pages.py      # About, pricing, getting-started
├── test_auth.py             # Authentication flow tests
├── test_public_pages.py     # Public page tests
├── test_dashboard.py        # Dashboard tests
├── test_navigation.py       # Navigation and routing tests
├── test_expenses.py         # Expense CRUD tests
├── test_income.py           # Income CRUD tests
├── test_categories.py       # Category management tests
├── test_transactions.py     # Transaction page tests
├── test_bank_statements.py  # Bank statement tests
├── test_goals.py            # Goal CRUD tests
├── test_debts.py            # Debt CRUD tests
├── test_profile.py          # Profile/settings tests
└── test_onboarding.py       # Onboarding flow tests
```

## UI Flows Covered

| Flow | Test File | Auth Required |
|------|-----------|---------------|
| About / Landing page | `test_public_pages.py` | No |
| Pricing page | `test_public_pages.py` | No |
| Getting Started guide | `test_public_pages.py` | No |
| Login | `test_auth.py` | No (partially) |
| Signup & Waitlist | `test_auth.py` | No |
| Session guards | `test_auth.py` | No |
| Dashboard | `test_dashboard.py` | Yes |
| Sidebar navigation | `test_navigation.py` | Yes |
| Header user menu | `test_navigation.py` | Yes |
| Route redirects | `test_navigation.py` | Yes |
| Mobile nav | `test_navigation.py` | Yes |
| Expense CRUD | `test_expenses.py` | Yes |
| Income CRUD | `test_income.py` | Yes |
| Category management | `test_categories.py` | Yes |
| Transaction filtering | `test_transactions.py` | Yes |
| Bank statement upload | `test_bank_statements.py` | Yes |
| Goal CRUD | `test_goals.py` | Yes |
| Debt CRUD | `test_debts.py` | Yes |
| Profile & themes | `test_profile.py` | Yes |
| Onboarding flow | `test_onboarding.py` | Yes |
