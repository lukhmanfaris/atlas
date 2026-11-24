import { expect, test } from "@playwright/test";

test("the Hello page shows the signed-in staff email", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Hello" })).toBeVisible();
  await expect(page.getByText("owner@example.com")).toBeVisible();
});
