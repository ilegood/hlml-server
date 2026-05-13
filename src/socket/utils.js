export const toInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const parseJsonArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);

  try {
    const parsed = JSON.parse(Buffer.isBuffer(value) ? value.toString() : value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (error) {
    console.error("JSON parse error:", error);
    return [];
  }
};
