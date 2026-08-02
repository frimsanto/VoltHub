import { test, expect } from "./fixtures";
import { login, CREDENTIALS, ONE_PX_PNG } from "./helpers";
import { T } from "./selectors";

/**
 * PROFILE — account info edit + avatar upload, including persistence across a
 * reload and a fresh login (the avatar must be stored server-side, not just in
 * the local object-URL preview).
 */
test.describe("Profile", () => {
  test("opens the profile page", async ({ petugasPage }) => {
    await petugasPage.goto("/profile");
    await expect(petugasPage).toHaveURL(/\/profile/);
    await expect(petugasPage.getByTestId(T.profileSave)).toBeVisible();
  });

  test("edits account details", async ({ petugasPage }) => {
    await petugasPage.goto("/profile");
    // A changing value guarantees the form is dirty so Save enables.
    const phone = `08${Date.now().toString().slice(-9)}`;
    await petugasPage.getByTestId(T.profilePhone).fill(phone);
    await petugasPage.getByTestId(T.profileSave).click();
    await expect(petugasPage.getByText(/Perubahan tersimpan/i)).toBeVisible();
  });

  test("uploads a profile photo", async ({ petugasPage }) => {
    await petugasPage.goto("/profile");
    await petugasPage.getByTestId(T.profileAvatarInput).setInputFiles({
      name: "avatar-e2e.png",
      mimeType: "image/png",
      buffer: ONE_PX_PNG,
    });
    await expect(petugasPage.getByText(/Foto profil diperbarui/i)).toBeVisible({ timeout: 15_000 });
  });

  test("persists the profile photo after a refresh", async ({ petugasPage }) => {
    await petugasPage.goto("/profile");
    await petugasPage.getByTestId(T.profileAvatarInput).setInputFiles({
      name: "avatar-e2e.png",
      mimeType: "image/png",
      buffer: ONE_PX_PNG,
    });
    await expect(petugasPage.getByText(/Foto profil diperbarui/i)).toBeVisible({ timeout: 15_000 });

    await petugasPage.reload();
    // After reload the avatar src is the server URL (not the transient blob: preview).
    const src = await petugasPage.getByTestId(T.profileAvatarImg).getAttribute("src");
    expect(src).toBeTruthy();
    expect(src ?? "").not.toMatch(/^blob:/);
  });

  test("persists the profile photo after a fresh login", async ({ petugasPage, browser }) => {
    // Upload on the existing (stored) session.
    await petugasPage.goto("/profile");
    await petugasPage.getByTestId(T.profileAvatarInput).setInputFiles({
      name: "avatar-e2e.png",
      mimeType: "image/png",
      buffer: ONE_PX_PNG,
    });
    await expect(petugasPage.getByText(/Foto profil diperbarui/i)).toBeVisible({ timeout: 15_000 });

    // Brand-new context → real login → the avatar must come back from the server.
    const ctx = await browser.newContext();
    const fresh = await ctx.newPage();
    await login(fresh, CREDENTIALS.petugas);
    await fresh.goto("/profile");
    const src = await fresh.getByTestId(T.profileAvatarImg).getAttribute("src");
    expect(src).toBeTruthy();
    expect(src ?? "").not.toMatch(/^blob:/);
    await ctx.close();
  });
});
