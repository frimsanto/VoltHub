import { test, expect } from "@playwright/test";
import { login, logout, CREDENTIALS, expectAuthenticated } from "./helpers";
import { T } from "./selectors";

/**
 * AUTH — login/logout lifecycle & session persistence.
 *
 * These run on a fresh, un-authenticated page (no storageState) since they
 * exercise the login flow itself.
 */
test.describe("Auth", () => {
  test("logs in as Petugas and lands on the dashboard", async ({ page }) => {
    await login(page, CREDENTIALS.petugas);
    await expectAuthenticated(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId(T.userMenuTrigger)).toBeVisible();
  });

  test("logs in as Admin and lands on the dashboard", async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await expectAuthenticated(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("ghost@pln.co.id");
    await page.locator("#password").fill("wrong-password");
    await page.getByTestId(T.loginSubmit).click();
    // Stays on the login page; an inline error alert (role="alert") is rendered.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("logs out via the avatar menu", async ({ page }) => {
    await login(page, CREDENTIALS.petugas);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test("persists the session across a reload", async ({ page }) => {
    await login(page, CREDENTIALS.petugas);
    // Tokens live in localStorage (Zustand persist); a hard reload must re-hydrate
    // the auth store and keep us inside the app rather than bounce to /login.
    await page.reload();
    await expectAuthenticated(page);
    await expect(page.getByTestId(T.userMenuTrigger)).toBeVisible();
  });
});
