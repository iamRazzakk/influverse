/** Server money is integer cents → "€1,250" / "€12.50". Safe on server and client. */
export const formatCents = (cents: number | null | undefined, currency = 'EUR') => {
  const amount = (cents ?? 0) / 100;
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
};
