import { test, expect } from "./fixtures";
import { T } from "./selectors";

/**
 * NOTIFICATIONS — the top-bar notification center (NotificationDropdown).
 *
 * Reality check: the in-app dropdown is backed by a local store whose
 * `addNotification` has no callers — validation outcomes are delivered only via
 * server-side web-push (`sendToUser`), not into this in-app feed. So these tests
 * assert the real, stable affordance: the bell renders, the panel opens, and it
 * shows its genuine empty state rather than mocked delivered content.
 */
test.describe("Notifications", () => {
  test("the notification bell is present in the top bar", async ({ petugasPage }) => {
    await petugasPage.goto("/dashboard");
    await expect(petugasPage.getByTestId(T.notifBell)).toBeVisible();
  });

  test("opening the bell reveals the notification panel", async ({ petugasPage }) => {
    await petugasPage.goto("/dashboard");
    await petugasPage.getByTestId(T.notifBell).click();
    await expect(petugasPage.getByRole("heading", { name: "Notifikasi" })).toBeVisible();
  });

  test("the panel shows the empty state when no in-app notifications are delivered", async ({
    petugasPage,
  }) => {
    await petugasPage.goto("/dashboard");
    await petugasPage.getByTestId(T.notifBell).click();
    await expect(petugasPage.getByText("Tidak ada notifikasi")).toBeVisible();
  });
});
