export function twd(amount: number): string {
  return `NT$${Math.round(amount).toLocaleString("zh-TW")}`;
}

export function signedTwd(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}NT$${Math.abs(Math.round(amount)).toLocaleString("zh-TW")}`;
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function multiplier(value: number): string {
  return `×${value.toFixed(2)}`;
}
