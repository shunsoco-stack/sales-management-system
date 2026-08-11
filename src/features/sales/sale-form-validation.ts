export const MAX_SALE_ITEMS = 2;

export function validateSaleItemCount(count: number): string | null {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SALE_ITEMS) {
    return `売上明細は1件以上${MAX_SALE_ITEMS}件以下で登録してください。`;
  }
  return null;
}

export function validateSoldAt(value: string): string | null {
  if (!value.trim() || !Number.isFinite(new Date(value).getTime())) {
    return "売上日時を正しく入力してください。";
  }
  return null;
}
