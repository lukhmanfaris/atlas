import { expect, test } from "@playwright/test";

test("shows the signed-in email, the company switcher and the floating bar", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("halfxindustries@gmail.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch company" })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Customers" })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Settings" })).toBeVisible();
});

test("switching company lands on customers and applies everywhere", async ({ page }) => {
  await page.goto("/settings");

  await page.getByRole("button", { name: "Switch company" }).click();
  await page.getByRole("button", { name: /Atlas Trading Sdn Bhd/ }).click();

  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await expect(page.getByText("Buyers of Atlas Trading Sdn Bhd.")).toBeVisible();

  await page.getByRole("navigation").getByRole("link", { name: "Settings" }).click();
  await expect(page.getByLabel("Company name")).toHaveValue("Atlas Trading Sdn Bhd");
});

test("hides the tax fields while the company is not SST-registered", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByLabel("Company name")).toBeVisible();
  await expect(page.getByLabel("SST number")).toHaveCount(0);
  await expect(page.getByLabel("TIN")).toHaveCount(0);
  await expect(page.getByLabel("MSIC code")).toHaveCount(0);
  await expect(page.getByText(/not SST-registered/)).toBeVisible();
});

test("creates, opens, edits and archives a customer", async ({ page }) => {
  const name = `E2E Customer ${Date.now()}`;

  await page.goto("/customers");
  await page.getByRole("button", { name: "New customer" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Billing address", { exact: true }).fill("1 Test Road\n50000 Kuala Lumpur");
  await page.getByRole("button", { name: "Save customer" }).click();

  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();

  await row.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);
  await expect(page.getByText("1 Test Road").first()).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Contact person").fill("Aminah");
  await page.getByRole("button", { name: "Save customer" }).click();
  await expect(page.getByText("Aminah")).toBeVisible();

  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("archived")).toBeVisible();

  await page.goto("/customers");
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);

  await page.getByLabel("Show archived").check();
  await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
});
