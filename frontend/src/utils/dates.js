const BD_TIME_ZONE = 'Asia/Dhaka';

function asDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateBD(value) {
  if (!value) return '-';
  const text = String(value);
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return `${day}-${month}-${year}`;
  }
  const date = asDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BD_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date).replace(/\//g, '-');
}

export function formatDateTimeBD(value) {
  const date = asDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BD_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date).replace(',', '');
}

export function todayBD() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}
