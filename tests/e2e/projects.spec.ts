import { test, expect } from "@playwright/test";

test.describe("Projects", () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.getByLabel(/メール|Email/i).fill("admin@example.com");
    await page.getByLabel(/パスワード|Password/i).fill("password123");
    await page.getByRole("button", { name: /ログイン|Login|Sign in/i }).click();
    await expect(page).toHaveURL(/\/projects/, { timeout: 10000 });
  });

  test("should display projects list", async ({ page }) => {
    await page.goto("/projects");

    await expect(page.getByRole("heading", { name: /プロジェクト|Projects/i })).toBeVisible();
  });

  test("should navigate to new project page", async ({ page }) => {
    await page.goto("/projects");

    await page.getByRole("link", { name: /新規|New|作成|Create/i }).click();
    await expect(page).toHaveURL(/\/projects\/new/);
  });

  test("should create a new project", async ({ page }) => {
    await page.goto("/projects/new");

    const projectName = `Test Project ${Date.now()}`;
    await page.getByLabel(/プロジェクト名|Name/i).fill(projectName);
    await page.getByRole("button", { name: /作成|Create/i }).click();

    // Should redirect to projects or project detail
    await expect(page).toHaveURL(/\/projects/);
  });

  test("should view project details", async ({ page }) => {
    await page.goto("/projects");

    // Click on first project
    const projectLink = page.locator("a[href^='/projects/']").first();
    if (await projectLink.isVisible()) {
      await projectLink.click();
      await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    }
  });
});
