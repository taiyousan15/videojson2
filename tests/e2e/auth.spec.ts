import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should redirect to login page when not authenticated", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should show login form", async ({ page }) => {
    await page.goto("/login");

    // ページタイトルは "VideoJSON" で、"ログインしてください" のメッセージがある
    await expect(page.getByRole("heading", { name: /VideoJSON/i })).toBeVisible();
    await expect(page.getByText(/ログインしてください/i)).toBeVisible();
    await expect(page.getByLabel(/メール|Email/i)).toBeVisible();
    await expect(page.getByLabel(/パスワード|Password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /ログイン|Login|Sign in/i })).toBeVisible();
  });

  test("should show error with invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/メール|Email/i).fill("invalid@example.com");
    await page.getByLabel(/パスワード|Password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /ログイン|Login|Sign in/i }).click();

    // Should stay on login page or show error
    await expect(page).toHaveURL(/\/login/);
  });

  test("should login with valid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/メール|Email/i).fill("admin@example.com");
    await page.getByLabel(/パスワード|Password/i).fill("password123");
    await page.getByRole("button", { name: /ログイン|Login|Sign in/i }).click();

    // Should redirect to projects
    await expect(page).toHaveURL(/\/projects/, { timeout: 10000 });
  });
});

test.describe("Authorization", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto("/login");
    await page.getByLabel(/メール|Email/i).fill("admin@example.com");
    await page.getByLabel(/パスワード|Password/i).fill("password123");
    await page.getByRole("button", { name: /ログイン|Login|Sign in/i }).click();
    await expect(page).toHaveURL(/\/projects/, { timeout: 10000 });
  });

  test("admin should access admin page", async ({ page }) => {
    await page.goto("/admin");
    // h1タグの「管理ダッシュボード」を具体的に指定
    await expect(page.getByRole("heading", { name: "管理ダッシュボード", level: 1 })).toBeVisible();
  });
});
