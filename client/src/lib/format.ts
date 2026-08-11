export const currency = (value: string | number | null | undefined) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));

export const compactCurrency = (value: number) => {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)} L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return currency(value);
};

export const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** For prefilling <input type="date">, which requires exactly yyyy-mm-dd. */
export const toDateInput = (value: string | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

export const relativeDay = (value: string | null | undefined) => {
  if (!value) return '';
  const target = new Date(value);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days < 0 ? `${Math.abs(days)} days overdue` : `in ${days} days`;
};

export const titleCase = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
