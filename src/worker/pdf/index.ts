import type { PdfModel } from "./layout";
import { renderDeliveryOrder } from "./delivery-order";
import { renderInvoice } from "./invoice";
import { renderQuotation } from "./quotation";

/**
 * One template per document type, used by both the HTML preview route and the
 * PDF generator so they can never drift apart.
 */
export function renderDocumentHtml(model: PdfModel) {
  switch (model.type) {
    case "quotation":
      return renderQuotation(model);
    case "invoice":
      return renderInvoice(model);
    case "delivery_order":
      return renderDeliveryOrder(model);
  }
}

export type { PdfCompany, PdfCustomer, PdfLine, PdfModel, PdfVariant } from "./layout";
