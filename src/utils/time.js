export const toUtcIsoString = (value) => {
  if (!value) return value;

  if (value instanceof Date) return value.toISOString();

  const text = String(value).trim();
  if (!text) return text;

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date.toISOString();
  }

  const mysqlTimestamp = text.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/,
  );

  if (mysqlTimestamp) {
    const [, datePart, timePart, fraction = ""] = mysqlTimestamp;
    const date = new Date(`${datePart}T${timePart}${fraction}Z`);
    return Number.isNaN(date.getTime()) ? text : date.toISOString();
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
};
