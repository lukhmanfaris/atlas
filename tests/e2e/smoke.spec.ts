import { expect, test } from "@playwright/test";

test("shows the signed-in staff email and the company switcher", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("halfxindustries@gmail.com")).toBeVisible();

  const switcher = page.getByRole("combobox", { name: "Current company" });
  await expect(switcher).toBeVisible();
  await expect(switcher.locator("option")).toHaveCount(2);

  await expect(
    page.getByRole("listitem").filter({ hasText: "Atlas Trading Sdn Bhd" }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Atlas Services Sdn Bhd" }),
  ).toBeVisible();
});

test("switching company changes the settings shown", async ({ page }) => {
  await page.goto("/settings");

  await page.getByRole("combobox", { name: "Current company" }).selectOption({
    label: "Atlas Trading Sdn Bhd",
  });

  await expect(page.getByRole("heading", { name: "Company settings" })).toBeVisible();
  await expect(page.getByLabel("Company name")).toHaveValue("Atlas Trading Sdn Bhd");

  await page.getByRole("combobox", { name: "Current company" }).selectOption({
    label: "Atlas Services Sdn Bhd",
  });
  await expect(page.getByLabel("Company name")).toHaveValue("Atlas Services Sdn Bhd");
});

test("hides the tax fields while the company is not SST-registered", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByLabel("Company name")).toBeVisible();
  await expect(page.getByLabel("SST number")).toHaveCount(0);
  await expect(page.getByLabel("TIN")).toHaveCount(0);
  await expect(page.getByLabel("MSIC code")).toHaveCount(0);
  await expect(page.getByText(/not SST-registered/)).toBeVisible();
});

test("creates, finds and archives a customer", async ({ page }) => {
  const name = `E2E Customer ${Date.now()}`;

  await page.goto("/customers");
  await page.getByRole("button", { name: "New customer" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Billing address", { exact: true }).fill("1 Test Road\n50000 Kuala Lumpur");
  await page.getByRole("button", { name: "Save customer" }).click();

  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible();

  await page.getByPlaceholder("Search by name").fill(name);
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Archive" }).click();
  await expect(row).toHaveCount(0);

  await page.getByLabel("Show archived").check();
  await expect(page.getByRole("listitem").filter({ hasText: "archived" })).toBeVisible();
});
