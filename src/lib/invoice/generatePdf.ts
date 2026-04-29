import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import logoUrl from "@/assets/care-cuddle-logo.png";

export interface InvoiceData {
  invoiceNumber: number | string;
  dateRequested: Date | string;
  description: string;
  amount: number;
  currency: string;
  // Contractor (from)
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankName: string;
  sortCode?: string;
  iban?: string;
  swift?: string;
  // Bill to
  billTo: {
    companyName: string;
    companyNumber?: string;
    addressLines: string[];
  };
}

const BRAND_PURPLE: [number, number, number] = [95, 23, 235]; // #5F17EB

const currencySymbol = (c: string) => {
  switch ((c || "GBP").toUpperCase()) {
    case "NGN": return "\u20A6"; // ₦
    case "GBP": return "\u00A3"; // £
    case "USD": return "$";
    case "EUR": return "\u20AC"; // €
    default: return c + " ";
  }
};

const formatMoney = (amount: number, currency: string) => {
  const sym = currencySymbol(currency);
  const formatted = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${sym} ${formatted}`;
};

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateInvoicePdf(data: InvoiceData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // Logo
  const logo = await loadImageAsDataUrl(logoUrl);
  if (logo) {
    try {
      doc.addImage(logo, "PNG", margin, y, 80, 80);
    } catch {
      // ignore
    }
  }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...BRAND_PURPLE);
  doc.text("Contractor Invoice", pageWidth - margin, y + 30, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Invoice #${data.invoiceNumber}`, pageWidth - margin, y + 50, { align: "right" });
  const dateStr = typeof data.dateRequested === "string"
    ? format(new Date(data.dateRequested), "EEEE, MMMM d, yyyy")
    : format(data.dateRequested, "EEEE, MMMM d, yyyy");
  doc.text(dateStr, pageWidth - margin, y + 65, { align: "right" });

  y += 100;

  // Divider
  doc.setDrawColor(...BRAND_PURPLE);
  doc.setLineWidth(1.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // From / Bill To columns
  const colWidth = (pageWidth - margin * 2 - 20) / 2;
  const fromX = margin;
  const billX = margin + colWidth + 20;
  const startY = y;

  // FROM
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_PURPLE);
  doc.text("FROM", fromX, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text(data.companyName || "—", fromX, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60);
  const fromLines: string[] = [];
  if (data.contactName) fromLines.push(data.contactName);
  if (data.address) fromLines.push(...data.address.split("\n"));
  if (data.phone) fromLines.push(`Tel: ${data.phone}`);
  if (data.email) fromLines.push(data.email);
  for (const line of fromLines) {
    const split = doc.splitTextToSize(line, colWidth);
    doc.text(split, fromX, y);
    y += 14 * split.length;
  }

  // BILL TO
  let yBill = startY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_PURPLE);
  doc.text("BILL TO", billX, yBill);
  yBill += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text(data.billTo.companyName, billX, yBill);
  yBill += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60);
  if (data.billTo.companyNumber) {
    doc.text(`Company No: ${data.billTo.companyNumber}`, billX, yBill);
    yBill += 14;
  }
  for (const line of data.billTo.addressLines) {
    doc.text(line, billX, yBill);
    yBill += 14;
  }

  y = Math.max(y, yBill) + 20;

  // Bank details box
  doc.setFillColor(245, 240, 255);
  doc.setDrawColor(...BRAND_PURPLE);
  doc.setLineWidth(0.5);
  const bankBoxY = y;
  doc.roundedRect(margin, bankBoxY, pageWidth - margin * 2, 80, 4, 4, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_PURPLE);
  doc.text("PAYMENT DETAILS", margin + 12, bankBoxY + 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(40);
  const bankLines: string[] = [];
  if (data.bankAccountName) bankLines.push(`Account Name: ${data.bankAccountName}`);
  if (data.bankAccountNumber) bankLines.push(`Account Number: ${data.bankAccountNumber}`);
  if (data.bankName) bankLines.push(`Bank: ${data.bankName}`);
  if (data.sortCode) bankLines.push(`Sort Code: ${data.sortCode}`);
  if (data.iban) bankLines.push(`IBAN: ${data.iban}`);
  if (data.swift) bankLines.push(`SWIFT: ${data.swift}`);
  let by = bankBoxY + 36;
  for (const line of bankLines) {
    doc.text(line, margin + 12, by);
    by += 13;
  }

  y = bankBoxY + 100;

  // Items table
  autoTable(doc, {
    startY: y,
    head: [["Description of Job", "Amount Requested"]],
    body: [[data.description, formatMoney(data.amount, data.currency)]],
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: BRAND_PURPLE,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 11,
    },
    bodyStyles: {
      fontSize: 11,
      cellPadding: 10,
    },
    columnStyles: {
      1: { halign: "right", cellWidth: 160 },
    },
    theme: "grid",
  });

  // @ts-expect-error lastAutoTable injected by plugin
  const finalY = (doc.lastAutoTable?.finalY ?? y) + 16;

  // Total
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND_PURPLE);
  doc.text("Total", pageWidth - margin - 160, finalY + 6);
  doc.text(formatMoney(data.amount, data.currency), pageWidth - margin, finalY + 6, { align: "right" });

  // Footer
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    "Generated via Care Cuddle Academy",
    pageWidth / 2,
    doc.internal.pageSize.getHeight() - 24,
    { align: "center" }
  );

  return doc;
}

export async function downloadInvoicePdf(data: InvoiceData, fileName?: string) {
  const doc = await generateInvoicePdf(data);
  const name = fileName || `Invoice-${data.invoiceNumber}.pdf`;
  doc.save(name);
}

export async function getInvoicePdfBase64(data: InvoiceData): Promise<string> {
  const doc = await generateInvoicePdf(data);
  // datauristring: data:application/pdf;base64,xxxx
  const dataUri = doc.output("datauristring");
  return dataUri.split(",")[1];
}
