import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import { App } from "./App";
import { CompanyProvider } from "./company";
import { CustomerDetailPage } from "./pages/customer-detail";
import { DeliveryOrderEditorPage } from "./pages/delivery-order-editor";
import { CustomersPage } from "./pages/customers";
import { HomePage } from "./pages/home";
import { ActivityPage } from "./pages/activity";
import { ItemsPage } from "./pages/items";
import { QuotationEditorPage } from "./pages/quotation-editor";
import { QuotationViewPage } from "./pages/quotation-view";
import { QuotationsPage } from "./pages/quotations";
import { SettingsPage } from "./pages/settings";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "customers", element: <CustomersPage /> },
      { path: "customers/:customerId", element: <CustomerDetailPage /> },
      { path: "settings/items", element: <ItemsPage /> },
      { path: "settings/activity", element: <ActivityPage /> },
      { path: "quotations", element: <QuotationsPage /> },
      { path: "invoices", element: <QuotationsPage documentType="invoice" /> },
      { path: "invoices/new", element: <QuotationEditorPage documentType="invoice" /> },
      { path: "invoices/:documentId", element: <QuotationViewPage documentType="invoice" /> },
      { path: "invoices/:documentId/edit", element: <QuotationEditorPage documentType="invoice" /> },
      { path: "delivery-orders", element: <QuotationsPage documentType="delivery_order" /> },
      { path: "delivery-orders/:documentId", element: <QuotationViewPage documentType="delivery_order" /> },
      { path: "delivery-orders/:documentId/edit", element: <DeliveryOrderEditorPage /> },
      { path: "quotations/new", element: <QuotationEditorPage /> },
      { path: "quotations/:documentId", element: <QuotationViewPage /> },
      { path: "quotations/:documentId/edit", element: <QuotationEditorPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element");
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CompanyProvider>
        <RouterProvider router={router} />
      </CompanyProvider>
    </QueryClientProvider>
  </StrictMode>,
);
