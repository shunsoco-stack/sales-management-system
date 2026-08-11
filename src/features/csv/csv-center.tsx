"use client";

import { useMemo, useRef, useState } from "react";
import { Download, FileCheck2, FileSpreadsheet, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { useSalesData } from "@/lib/sales-data-context";
import { useAuth } from "@/lib/auth-context";
import {
  analyzeLocationSales,
  analyzeStaffSales,
  calculateSaleAmounts,
  calculateSaleItemAmounts,
  createCsv,
  dimensionAnalysisToCsv,
  exportCustomersCsv,
  exportProductsCsv,
  exportSalesCsv,
  filterSales,
  groupSalesImportRows,
  parseCustomersImportCsv,
  parseProductsImportCsv,
  parseSalesImportCsv,
  resolvePeriodRange,
  type CsvImportResult,
  type Customer,
  type Product,
  type Sale,
  type SaleItem,
} from "@/lib/sales";
import { downloadTextFile } from "@/lib/format";

type ImportKind = "sales" | "products" | "customers";
const labels: Record<ImportKind, string> = { sales: "売上データ", products: "商品・サービス", customers: "顧客" };

function normalizedKey(value: string | undefined): string {
  return (value ?? "").trim().normalize("NFKC").toLocaleLowerCase("ja-JP");
}

function normalizedPhone(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\D/g, "");
}

function addRowError(errorsByRow: Map<number, string[]>, rowNumber: number, message: string) {
  const messages = errorsByRow.get(rowNumber) ?? [];
  if (!messages.includes(message)) messages.push(message);
  errorsByRow.set(rowNumber, messages);
}

function flagRepeatedKey(
  errorsByRow: Map<number, string[]>,
  firstRowByKey: Map<string, number>,
  key: string,
  rowNumber: number,
  message: string,
) {
  if (!key) return;
  const firstRow = firstRowByKey.get(key);
  if (firstRow === undefined) {
    firstRowByKey.set(key, rowNumber);
    return;
  }
  addRowError(errorsByRow, firstRow, message);
  addRowError(errorsByRow, rowNumber, message);
}

function withRowErrors<T>(
  result: CsvImportResult<T>,
  errorsByRow: ReadonlyMap<number, readonly string[]>,
): CsvImportResult<T> {
  const rows = result.rows.map((row) => {
    const extraErrors = errorsByRow.get(row.rowNumber) ?? [];
    const errors = [...row.errors, ...extraErrors.filter((message) => !row.errors.includes(message))];
    return errors.length > row.errors.length
      ? { ...row, data: undefined, errors }
      : { ...row, errors };
  });
  const validRows = rows.flatMap((row) => row.data === undefined ? [] : [row.data]);
  const invalidRows = rows.filter((row) => row.errors.length > 0);
  return {
    ...result,
    rows,
    validRows,
    invalidRows,
    canImport: result.globalErrors.length === 0 && invalidRows.length === 0 && validRows.length > 0,
  };
}

function currentMonthKey(referenceDate = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
  }).formatToParts(referenceDate);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

export function CsvCenter() {
  const { user } = useAuth();
  const { data, importData, hasPermission } = useSalesData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ImportKind>("sales");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const references = useMemo(() => ({ customerIds: new Set(data.customers.map((item) => item.id)), locationIds: new Set(data.locations.map((item) => item.id)), staffIds: new Set(data.staff.map((item) => item.id)), productIds: new Set(data.products.map((item) => item.id)), paymentMethodIds: new Set(data.paymentMethods.map((item) => item.id)) }), [data]);
  const validation = useMemo(() => {
    if (!text) return null;
    const errorsByRow = new Map<number, string[]>();
    if (kind === "sales") {
      const result = parseSalesImportCsv(text, references);
      const existingNumbers = new Set(data.sales.map((sale) => normalizedKey(sale.transactionNumber)));
      const firstRowByFingerprint = new Map<string, number>();
      for (const row of result.rows) {
        const transactionNumber = normalizedKey(row.raw["取引番号"]);
        if (transactionNumber && existingNumbers.has(transactionNumber)) {
          addRowError(errorsByRow, row.rowNumber, "取引番号は登録済みです。別の取引番号を指定してください。");
        }
        const fingerprint = result.headers.map((header) => normalizedKey(row.raw[header])).join("\u001f");
        flagRepeatedKey(errorsByRow, firstRowByFingerprint, fingerprint, row.rowNumber, "同一の売上明細がCSV内で重複しています。");
      }
      return withRowErrors(result, errorsByRow);
    }
    if (kind === "products") {
      const result = parseProductsImportCsv(text);
      const existingCodes = new Set(data.products.map((product) => normalizedKey(product.code)));
      const firstRowByCode = new Map<string, number>();
      for (const row of result.rows) {
        const code = normalizedKey(row.raw["商品コード"]);
        if (code && existingCodes.has(code)) {
          addRowError(errorsByRow, row.rowNumber, "商品コードは登録済みです。別の商品コードを指定してください。");
        }
        flagRepeatedKey(errorsByRow, firstRowByCode, code, row.rowNumber, "商品コードがCSV内で重複しています。");
      }
      return withRowErrors(result, errorsByRow);
    }

    const result = parseCustomersImportCsv(text);
    const existingEmails = new Set(data.customers.map((customer) => normalizedKey(customer.email)).filter(Boolean));
    const existingPhones = new Set(data.customers.map((customer) => normalizedPhone(customer.phone)).filter(Boolean));
    const existingNames = new Set(data.customers.map((customer) => normalizedKey(customer.name)).filter(Boolean));
    const firstRowByEmail = new Map<string, number>();
    const firstRowByPhone = new Map<string, number>();
    const firstRowByNameWithoutContact = new Map<string, number>();
    for (const row of result.rows) {
      const email = normalizedKey(row.raw["メールアドレス"]);
      const phone = normalizedPhone(row.raw["電話番号"]);
      const name = normalizedKey(row.raw["顧客名"]);
      if (email && existingEmails.has(email)) {
        addRowError(errorsByRow, row.rowNumber, "メールアドレスが登録済み顧客と重複しています。");
      }
      if (phone && existingPhones.has(phone)) {
        addRowError(errorsByRow, row.rowNumber, "電話番号が登録済み顧客と重複しています。");
      }
      if (!email && !phone && name && existingNames.has(name)) {
        addRowError(errorsByRow, row.rowNumber, "連絡先未入力のため、同名の登録済み顧客と重複しています。");
      }
      flagRepeatedKey(errorsByRow, firstRowByEmail, email, row.rowNumber, "メールアドレスがCSV内で重複しています。");
      flagRepeatedKey(errorsByRow, firstRowByPhone, phone, row.rowNumber, "電話番号がCSV内で重複しています。");
      if (!email && !phone) {
        flagRepeatedKey(errorsByRow, firstRowByNameWithoutContact, name, row.rowNumber, "連絡先未入力の同名顧客がCSV内で重複しています。");
      }
    }
    return withRowErrors(result, errorsByRow);
  }, [text, kind, references, data.sales, data.products, data.customers]);
  const currentRange = useMemo(() => resolvePeriodRange("currentMonth"), []);
  const previousRange = useMemo(() => resolvePeriodRange("previousMonth"), []);
  const periodKey = useMemo(() => currentMonthKey(), []);
  const currentSales = useMemo(() => filterSales(data.sales, { dateRange: currentRange }), [data.sales, currentRange]);
  const previousSales = useMemo(() => filterSales(data.sales, { dateRange: previousRange }), [data.sales, previousRange]);
  const staffRows = useMemo(() => analyzeStaffSales(currentSales, data.staff, { previousSales, goals: data.goals, periodKey }), [currentSales, data.staff, previousSales, data.goals, periodKey]);
  const locationRows = useMemo(() => analyzeLocationSales(currentSales, data.locations, { previousSales, goals: data.goals, periodKey }), [currentSales, data.locations, previousSales, data.goals, periodKey]);

  async function readFile(file?: File) { if (!file) return; if (!file.name.toLowerCase().endsWith(".csv")) { toast.error("CSVファイルを選択してください"); return; } setFileName(file.name); setText(await file.text()); }
  function clearFile() { setText(""); setFileName(""); if (inputRef.current) inputRef.current.value = ""; }

  async function handleImport() {
    if (!user || !validation?.canImport) return;
    setImporting(true);
    try {
      let records: Sale[] | Product[] | Customer[];
      const timestamp = new Date().toISOString();
      if (kind === "products") {
        const parsed = parseProductsImportCsv(text);
        records = parsed.validRows.map((row) => ({ id: `product-import-${row.code.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${crypto.randomUUID().slice(0, 6)}`, organizationId: user.organizationId, locationId: user.locationId, ...row, createdAt: timestamp, createdBy: user.uid, updatedAt: timestamp, updatedBy: user.uid }));
      } else if (kind === "customers") {
        const parsed = parseCustomersImportCsv(text);
        records = parsed.validRows.map((row) => ({ id: crypto.randomUUID(), organizationId: user.organizationId, locationId: user.locationId, ...row, registeredAt: timestamp, purchaseCount: 0, totalSalesYen: 0, averagePurchaseYen: 0, isActive: true, createdAt: timestamp, createdBy: user.uid, updatedAt: timestamp, updatedBy: user.uid }));
      } else {
        const parsed = parseSalesImportCsv(text, references);
        records = groupSalesImportRows(parsed.validRows).map((transaction) => {
          const customer = data.customers.find((item) => item.id === transaction.customerId)!;
          const staff = data.staff.find((item) => item.id === transaction.staffId)!;
          const payment = data.paymentMethods.find((item) => item.id === transaction.paymentMethodId)!;
          const saleId = crypto.randomUUID();
          const items: SaleItem[] = transaction.items.map((source, index) => { const product = data.products.find((item) => item.id === source.productId)!; const amounts = calculateSaleItemAmounts(source); return { id: `${saleId}-item-${index + 1}`, saleId, organizationId: user.organizationId, locationId: transaction.locationId, productId: product.id, productName: product.name, productCode: product.code, categoryId: product.categoryId, productType: product.productType, quantity: source.quantity, unitPriceYen: source.unitPriceYen, unitCostYen: product.costYen, taxRateBps: source.taxRateBps, ...amounts, createdAt: timestamp, createdBy: user.uid, updatedAt: timestamp, updatedBy: user.uid }; });
          const amounts = calculateSaleAmounts(transaction.items);
          return { id: saleId, organizationId: user.organizationId, locationId: transaction.locationId, transactionNumber: transaction.transactionNumber, soldAt: transaction.soldAt, customerId: customer.id, customerName: customer.name, staffId: staff.id, staffName: staff.name, items, subtotalYen: amounts.subtotalYen, discountYen: amounts.discountYen, taxableAmountYen: amounts.taxableAmountYen, taxYen: amounts.taxYen, totalYen: amounts.totalYen, refundedAmountYen: 0, paymentMethodId: payment.id, paymentMethodName: payment.name, saleType: transaction.saleType, status: transaction.status, memo: transaction.memo, createdAt: timestamp, createdBy: user.uid, updatedAt: timestamp, updatedBy: user.uid } satisfies Sale;
        });
      }
      const count = await importData(kind, records);
      toast.success(`${count}件を取り込みました`, { description: "監査ログにCSV取込として記録しました。" });
      clearFile();
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "CSVを取り込めませんでした。"); } finally { setImporting(false); }
  }

  function exportFile(name: string, content: string) { downloadTextFile(`${name}_${new Date().toISOString().slice(0, 10)}.csv`, content); toast.success(`${name}を出力しました`); }
  function template() { if (kind === "sales") return createCsv(["取引番号", "売上日時", "顧客ID", "店舗ID", "担当者ID", "商品ID", "数量", "単価", "明細割引", "税率(%)", "支払方法ID", "売上区分", "ステータス", "メモ"], [["IMP-001", new Date().toISOString(), data.customers[0]?.id ?? "customer-id", data.locations[0]?.id ?? "location-id", data.staff[0]?.id ?? "staff-id", data.products[0]?.id ?? "product-id", 1, data.products[0]?.priceYen ?? 1000, 0, 10, data.paymentMethods[0]?.id ?? "payment-id", "retail", "confirmed", "取込例"]]); if (kind === "products") return createCsv(["商品コード", "商品・サービス名", "種別", "カテゴリID", "販売価格", "原価", "税率(%)", "状態", "説明"], [["IMP-001", "取込サンプル", "商品", data.categories[0]?.id ?? "category-id", 3000, 1200, 10, "有効", "CSV取込例"]]); return createCsv(["顧客名", "顧客種別", "電話番号", "メールアドレス", "タグ"], [["架空 顧客", "個人", "000-0000-0000", "sample@example.invalid", "CSV取込"]]); }

  return <div><PageHeader title="CSV入出力" eyebrow="データ連携" description="既存データを出力し、形式・必須項目を検証してから安全に取り込みます。" />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-labelledby="exports-title"><h2 id="exports-title" className="sr-only">CSVエクスポート</h2>{[["売上一覧", () => exportFile("売上一覧", exportSalesCsv(data.sales))], ["顧客一覧", () => exportFile("顧客一覧", exportCustomersCsv(data.customers))], ["商品・サービス", () => exportFile("商品サービス", exportProductsCsv(data.products))], ["担当者別売上", () => exportFile("担当者別売上", dimensionAnalysisToCsv(staffRows, "担当者"))], ["店舗別売上", () => exportFile("店舗別売上", dimensionAnalysisToCsv(locationRows, "店舗"))]].map(([label, action]) => <button key={String(label)} type="button" onClick={action as () => void} disabled={!hasPermission("csv:export")} className="group rounded-2xl border border-black/[0.06] bg-white p-4 text-left shadow-sm transition active:scale-[0.98] hover:border-blue-200 hover:shadow-md disabled:opacity-50 motion-reduce:transition-none"><span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Download className="size-4" aria-hidden="true" /></span><strong className="mt-3 block text-sm">{String(label)}</strong><span className="mt-1 block text-xs text-slate-500">UTF-8 / BOM付き</span></button>)}</section>
    <section className="mt-6 rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6" aria-labelledby="import-title"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 id="import-title" className="text-lg font-bold">CSVインポート</h2><p className="mt-1 text-sm leading-6 text-slate-500">登録前に全行を検証し、エラーの行番号と内容を表示します。</p></div><button type="button" onClick={() => downloadTextFile(`${labels[kind]}_インポート雛形.csv`, template())} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700"><FileSpreadsheet className="size-4" aria-hidden="true" />雛形をダウンロード</button></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]"><label className="text-sm font-bold text-slate-700">取込対象<select value={kind} onChange={(event) => { setKind(event.target.value as ImportKind); clearFile(); }} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="sales">売上データ</option><option value="products">商品・サービス</option><option value="customers">顧客</option></select></label><div><input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event.target.files?.[0])} className="sr-only" id="csv-file" /><label htmlFor="csv-file" className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 text-center transition hover:border-blue-400 hover:bg-blue-50"><UploadCloud className="size-6 text-blue-600" aria-hidden="true" /><strong className="mt-2 text-sm text-slate-800">CSVファイルを選択</strong><span className="mt-1 text-xs text-slate-500">UTF-8（BOMあり／なし）</span></label></div></div>
      {validation ? <div className="mt-6"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><strong className="block text-sm">{fileName}</strong><span className="mt-1 block text-xs text-slate-500">{validation.rows.length}行 · 正常 {validation.validRows.length}行 · エラー {validation.invalidRows.length}行</span></div><StatusBadge status={validation.canImport ? "ready" : "error"} label={validation.canImport ? "取込可能" : "修正が必要"} tone={validation.canImport ? "success" : "danger"} /></div>{validation.globalErrors.length ? <ul className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{validation.globalErrors.map((message) => <li key={message}>・{message}</li>)}</ul> : null}{validation.invalidRows.length ? <div className="mt-4 overflow-hidden rounded-xl border border-red-200"><div className="bg-red-50 px-4 py-3 text-sm font-bold text-red-800">エラー行</div><ul className="max-h-52 divide-y divide-red-100 overflow-y-auto">{validation.invalidRows.slice(0, 30).map((row) => <li key={row.rowNumber} className="px-4 py-3 text-xs text-red-800"><strong>行 {row.rowNumber}</strong><span className="ml-2">{row.errors.join(" / ")}</span></li>)}</ul></div> : null}<div className="mt-4 overflow-hidden rounded-xl border border-slate-200"><div className="flex items-center gap-2 bg-slate-50 px-4 py-3 text-sm font-bold"><FileCheck2 className="size-4 text-blue-600" aria-hidden="true" />登録前プレビュー（先頭8行）</div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-xs"><thead><tr>{validation.headers.slice(0, 8).map((header) => <th key={header} className="bg-white px-3 py-2 text-left text-slate-500">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{validation.rows.slice(0, 8).map((row) => <tr key={row.rowNumber} className={row.errors.length ? "bg-red-50/50" : ""}>{validation.headers.slice(0, 8).map((header) => <td key={header} className="max-w-40 truncate px-3 py-2">{row.raw[header]}</td>)}</tr>)}</tbody></table></div></div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={clearFile} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700">ファイルを取消</button><button type="button" onClick={() => void handleImport()} disabled={!validation.canImport || importing || !hasPermission("csv:import")} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white disabled:opacity-50">{importing ? "取り込み中…" : `${validation.validRows.length}件を取り込む`}</button></div></div> : null}
    </section>
    <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm leading-6 text-blue-900"><strong>CSV仕様:</strong> 文字コードはUTF-8、1行目はヘッダーです。カンマ・改行・引用符を含む値はダブルクォートで囲みます。先頭が「=」「+」「-」「@」の文字列は、出力時に数式として実行されないよう保護します。</section>
  </div>;
}
