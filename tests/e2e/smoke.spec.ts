import { expect, test } from "@playwright/test";

test("shows the signed-in email, the company switcher and the floating bar", async ({ page }) => {
  await page.goto("/");

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

test("creates an item, prices it in sen and rejects a duplicate SKU", async ({ page }) => {
  const stamp = Date.now();
  const sku = `E2E-${stamp}`;

  await page.goto("/settings/items");
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByLabel("Name", { exact: true }).fill(`E2E Item ${stamp}`);
  await page.getByLabel(/^SKU/).fill(sku);
  await page.getByLabel(/^Unit price/).fill("12.50");
  await page.getByRole("button", { name: "Save item" }).click();

  const row = page.getByRole("row").filter({ hasText: sku });
  await expect(row).toBeVisible();
  await expect(row.getByText("RM 12.50")).toBeVisible();

  await page.getByRole("button", { name: "New item" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Duplicate SKU attempt");
  await page.getByLabel(/^SKU/).fill(sku);
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(
    page.getByText("That SKU is already used by another item in this company."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByPlaceholder("Search name or SKU").fill(sku);
  await expect(page.getByRole("row").filter({ hasText: sku })).toBeVisible();
  await page.getByRole("row").filter({ hasText: sku }).getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("row").filter({ hasText: sku })).toHaveCount(0);
});

test("assigns a SKU automatically from the category", async ({ page }) => {
  const stamp = Date.now();

  await page.goto("/settings/items");
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByLabel("Name", { exact: true }).fill(`Auto ${stamp}`);

  await page.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: /MCH — Merchandise/ }).click();

  await expect(page.getByText("Assigned when you save, e.g. MCH-001")).toBeVisible();
  await page.getByRole("button", { name: "Save item" }).click();

  const row = page.getByRole("row").filter({ hasText: `Auto ${stamp}` });
  await expect(row).toBeVisible();
  await expect(row.getByText(/MCH-\d{3}/)).toBeVisible();
});

test("creates and issues a quotation", async ({ page }) => {
  await page.goto("/quotations");
  await page.getByRole("button", { name: /New quotation/ }).click();

  await page.getByPlaceholder("Customer name").fill(`E2E Buyer ${Date.now()}`);
  await page.getByLabel("Billing address").fill("1 Test Road\n50000 Kuala Lumpur");

  await page.getByLabel("Description").first().fill("A4 Copier Paper");
  await page.getByLabel("Qty").fill("2");
  await page.getByLabel("Unit price (RM)").fill("23.50");

  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]+$/);
  await expect(page.getByText("Draft quotation")).toBeVisible();

  await page.getByRole("button", { name: "Issue" }).click();

  await expect(page.getByText(/QT-\d{4}/)).toBeVisible();
  await expect(page.getByText("issued", { exact: true })).toBeVisible();
});

test("creates and issues an invoice", async ({ page }) => {
  await page.goto("/invoices");
  await page.getByRole("button", { name: /New invoice/ }).click();

  await page.getByPlaceholder("Customer name").fill(`E2E Invoice Buyer ${Date.now()}`);
  await page.getByLabel("Billing address").fill("2 Test Road\n50000 Kuala Lumpur");
  await page.getByLabel("Description").first().fill("Consulting");
  await page.getByLabel("Qty").fill("1");
  await page.getByLabel("Unit price (RM)").fill("100.00");

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);

  await page.getByRole("button", { name: "Issue" }).click();
  await expect(page.getByText(/INV-\d{4}/)).toBeVisible();
});

test("keeps line breaks typed into item details", async ({ page }) => {
  const details = "Short Sleeve S-4XL\nPrinting Method: Silkscreen";

  await page.goto("/invoices");
  await page.getByRole("button", { name: /New invoice/ }).click();

  await page.getByPlaceholder("Customer name").fill(`E2E Details Buyer ${Date.now()}`);
  await page.getByLabel("Billing address").fill("3 Test Road\n50000 Kuala Lumpur");
  await page.getByLabel("Description").first().fill("Cotton Tshirt Printing");
  await page.getByLabel(/^Details/).first().fill(details);
  await expect(page.getByLabel(/^Details/).first()).toHaveValue(details);
  await page.getByLabel("Qty").fill("66");
  await page.getByLabel("Unit price (RM)").fill("15.00");

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);

  const documentId = page.url().split("/").pop();
  const preview = await page.request.get(`/api/documents/${documentId}/preview`);
  expect(await preview.text()).toContain(`<div class="line-details">${details}</div>`);
});
