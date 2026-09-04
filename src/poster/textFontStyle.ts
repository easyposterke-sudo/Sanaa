export function isPosterFontWeightBold(weight: string | number | undefined): boolean {
  if (typeof weight === 'number') return Number.isFinite(weight) && weight >= 700;
  if (typeof weight !== 'string') return false;
  const normalized = weight.trim().toLowerCase();
  if (normalized === 'bold' || normalized === 'bolder') return true;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric >= 700;
}
