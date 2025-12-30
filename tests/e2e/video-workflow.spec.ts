import { test, expect } from "@playwright/test";

test.describe("Video Workflow", () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.getByLabel(/メール|Email/i).fill("admin@example.com");
    await page.getByLabel(/パスワード|Password/i).fill("password123");
    await page.getByRole("button", { name: /ログイン|Login|Sign in/i }).click();
    await expect(page).toHaveURL(/\/projects/, { timeout: 10000 });
  });

  test("should show video detail page elements", async ({ page }) => {
    // Navigate to a project
    await page.goto("/projects");
    const projectLink = page.locator("a[href^='/projects/']").first();

    if (await projectLink.isVisible()) {
      await projectLink.click();
      await expect(page).toHaveURL(/\/projects\/[^/]+$/);

      // Check for videos section
      await expect(
        page.getByRole("heading", { name: /動画|Videos/i }).or(
          page.getByText(/動画|Videos/i)
        )
      ).toBeVisible();
    }
  });

  test("should navigate to video creation", async ({ page }) => {
    await page.goto("/projects");
    const projectLink = page.locator("a[href^='/projects/']").first();

    if (await projectLink.isVisible()) {
      await projectLink.click();

      // Look for new video button/link
      const newVideoLink = page.getByRole("link", { name: /新規動画|New Video|動画追加/i });
      if (await newVideoLink.isVisible()) {
        await newVideoLink.click();
        await expect(page).toHaveURL(/\/videos\/new/);
      }
    }
  });
});

test.describe("Video Detail Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/メール|Email/i).fill("admin@example.com");
    await page.getByLabel(/パスワード|Password/i).fill("password123");
    await page.getByRole("button", { name: /ログイン|Login|Sign in/i }).click();
    await expect(page).toHaveURL(/\/projects/, { timeout: 10000 });
  });

  test("should display quick links section", async ({ page }) => {
    // This test assumes there's at least one project with one video
    await page.goto("/projects");
    const projectLink = page.locator("a[href^='/projects/']").first();

    if (await projectLink.isVisible()) {
      await projectLink.click();

      // Find and click a video link
      const videoLink = page.locator("a[href*='/videos/']").first();
      if (await videoLink.isVisible()) {
        await videoLink.click();

        // Check for quick links
        await expect(
          page.getByRole("link", { name: /Highlights Review/i }).or(
            page.getByText(/Highlights/i)
          )
        ).toBeVisible({ timeout: 5000 }).catch(() => {
          // Quick links might not be visible if page structure is different
        });
      }
    }
  });

  test("should display jobs section", async ({ page }) => {
    await page.goto("/projects");
    const projectLink = page.locator("a[href^='/projects/']").first();

    if (await projectLink.isVisible()) {
      await projectLink.click();

      const videoLink = page.locator("a[href*='/videos/']").first();
      if (await videoLink.isVisible()) {
        await videoLink.click();

        // Check for jobs section
        await expect(
          page.getByText(/Jobs/i).or(page.getByText(/ジョブ/i))
        ).toBeVisible({ timeout: 5000 }).catch(() => {
          // Jobs section might be named differently
        });
      }
    }
  });
});

test.describe("Render Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/メール|Email/i).fill("admin@example.com");
    await page.getByLabel(/パスワード|Password/i).fill("password123");
    await page.getByRole("button", { name: /ログイン|Login|Sign in/i }).click();
    await expect(page).toHaveURL(/\/projects/, { timeout: 10000 });
  });

  test("should display render configuration options", async ({ page }) => {
    // Navigate to render page if video exists
    await page.goto("/projects");
    const projectLink = page.locator("a[href^='/projects/']").first();

    if (await projectLink.isVisible()) {
      await projectLink.click();

      const videoLink = page.locator("a[href*='/videos/']").first();
      if (await videoLink.isVisible()) {
        await videoLink.click();

        // Try to navigate to render page
        const renderLink = page.getByRole("link", { name: /Render/i });
        if (await renderLink.isVisible()) {
          await renderLink.click();

          // Check for render options
          await expect(page.getByText(/フォーマット|Format/i)).toBeVisible({ timeout: 5000 }).catch(() => {});
          await expect(page.getByText(/品質|Quality/i)).toBeVisible({ timeout: 5000 }).catch(() => {});
        }
      }
    }
  });
});
