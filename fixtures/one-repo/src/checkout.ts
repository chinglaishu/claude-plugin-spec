export function total(items: number[], voucher = 0): number {
  const sum = items.reduce((a, b) => a + b, 0);
  return Math.max(0, sum - voucher);
}
