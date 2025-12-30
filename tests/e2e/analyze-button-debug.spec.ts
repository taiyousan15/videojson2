import { test, expect } from "@playwright/test";

test.describe("Analyze Button Debug", () => {
  test("should debug Analyze button click behavior", async ({ page }) => {
    // Enable console logging
    page.on("console", (msg) => {
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
    });

    // Track all network requests
    const requests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      const method = request.method();
      if (url.includes("/api/")) {
        console.log(`[Network] ${method} ${url}`);
        requests.push(`${method} ${url}`);
      }
    });

    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/api/")) {
        console.log(`[Response] ${response.status()} ${url}`);
        if (response.status() >= 400) {
          try {
            const body = await response.text();
            console.log(`[Response Body] ${body}`);
          } catch {}
        }
      }
    });

    // Login with dev user
    await page.goto("/login");
    await page.getByLabel(/メール|Email/i).fill("dev@example.com");
    await page.getByLabel(/パスワード|Password/i).fill("password123");
    await page.getByRole("button", { name: /ログイン|Login|Sign in/i }).click();
    await expect(page).toHaveURL(/\/projects/, { timeout: 10000 });

    // Navigate to the specific video that has INGEST completed
    // Using the video ID from the logs: c735d400-05e5-4f38-ac00-83402525cad1
    await page.goto("/projects/917f86f9-e624-41b4-abbf-323662cf7c21/videos/c735d400-05e5-4f38-ac00-83402525cad1");

    // Wait for page to load
    await page.waitForLoadState("networkidle");

    // Log the page state
    const videoStatus = await page.locator(".rounded-full").first().textContent();
    console.log(`[Debug] Video Status: ${videoStatus}`);

    // Check if Analyze button exists
    const analyzeButton = page.locator("button").filter({ hasText: "Analyze" });
    const buttonCount = await analyzeButton.count();
    console.log(`[Debug] Found ${buttonCount} Analyze button(s)`);

    if (buttonCount > 0) {
      // Get button state before click
      const isDisabled = await analyzeButton.first().isDisabled();
      console.log(`[Debug] Analyze button disabled: ${isDisabled}`);

      // Get button classes
      const buttonClasses = await analyzeButton.first().getAttribute("class");
      console.log(`[Debug] Button classes: ${buttonClasses}`);

      // Check if button has "Needs: INGEST" text
      const buttonText = await analyzeButton.first().textContent();
      console.log(`[Debug] Button text content: ${buttonText}`);

      if (!isDisabled) {
        // Clear previous requests
        requests.length = 0;

        // Click the Analyze button
        console.log("[Debug] Clicking Analyze button...");
        await analyzeButton.first().click();

        // Wait a bit for the request to be made
        await page.waitForTimeout(2000);

        // Log all requests made after click
        console.log(`[Debug] Requests after click: ${JSON.stringify(requests)}`);

        // Check if POST to /api/videos/*/jobs was made
        const jobsRequest = requests.find((r) => r.includes("POST") && r.includes("/jobs"));
        if (jobsRequest) {
          console.log(`[Debug] SUCCESS - Found jobs API request: ${jobsRequest}`);
        } else {
          console.log("[Debug] FAILURE - No POST to /api/videos/*/jobs found");
          console.log("[Debug] All requests:", requests);
        }
      } else {
        // Debug why button is disabled
        console.log("[Debug] Button is disabled. Checking conditions...");

        // Get jobs list from page
        const jobsSection = page.locator("text=Jobs").first();
        const succeededJobs = await page.locator("text=SUCCEEDED").count();
        console.log(`[Debug] SUCCEEDED jobs count: ${succeededJobs}`);
      }
    }

    // Take a screenshot for debugging
    await page.screenshot({ path: "tests/e2e/screenshots/analyze-button-debug.png", fullPage: true });
  });

  test("should check JobActions component state", async ({ page }) => {
    // This test checks the component props and state
    await page.goto("/login");
    await page.getByLabel(/メール|Email/i).fill("dev@example.com");
    await page.getByLabel(/パスワード|Password/i).fill("password123");
    await page.getByRole("button", { name: /ログイン|Login|Sign in/i }).click();
    await expect(page).toHaveURL(/\/projects/, { timeout: 10000 });

    // Go to video page
    await page.goto("/projects/917f86f9-e624-41b4-abbf-323662cf7c21/videos/c735d400-05e5-4f38-ac00-83402525cad1");
    await page.waitForLoadState("networkidle");

    // Evaluate component state by checking the DOM
    const analyzeButtonContainer = page.locator("button").filter({ hasText: "Analyze" }).first();

    // Check for "Needs: INGEST" text which indicates INGEST is not completed
    const needsIngest = await page.locator("text=Needs: INGEST").count();
    console.log(`[Debug] 'Needs: INGEST' elements: ${needsIngest}`);

    // Check for "Completed" text on any buttons
    const completedButtons = await page.locator("text=Completed").count();
    console.log(`[Debug] 'Completed' elements: ${completedButtons}`);

    // Check the INGEST job status in the Jobs section
    const ingestStatus = await page.locator("li").filter({ hasText: "取り込み" }).locator(".rounded").first().textContent();
    console.log(`[Debug] INGEST job status: ${ingestStatus}`);

    // Log all button states
    const buttons = page.locator(".grid button");
    const buttonStates = await buttons.evaluateAll((btns) =>
      btns.map((btn) => ({
        text: btn.textContent,
        disabled: (btn as HTMLButtonElement).disabled,
        classes: btn.className,
      }))
    );
    console.log("[Debug] All buttons:", JSON.stringify(buttonStates, null, 2));
  });
});
