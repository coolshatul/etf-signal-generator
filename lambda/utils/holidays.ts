// NSE Holidays for 2026
export const NSE_HOLIDAYS_2026 = [
  '2026-01-15', // Municipal Corporation Election - Maharashtra
  '2026-01-26', // Republic Day
  '2026-03-03', // Holi
  '2026-03-26', // Shri Ram Navami
  '2026-03-31', // Shri Mahavir Jayanti
  '2026-04-03', // Good Friday
  '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-05-28', // Bakri Id
  '2026-06-26', // Muharram
  '2026-09-14', // Ganesh Chaturthi
  '2026-10-02', // Mahatma Gandhi Jayanti
  '2026-10-20', // Dussehra
  '2026-11-10', // Diwali-Balipratipada
  '2026-11-24', // Prakash Gurpurb Sri Guru Nanak Dev
  '2026-12-25', // Christmas
];

/**
 * Check if today is an NSE holiday
 * @returns true if today is a holiday, false otherwise
 */
export function isTodayHoliday(): boolean {
  const today = new Date();
  const todayString = today.toISOString().split('T')[0]; // YYYY-MM-DD format

  return NSE_HOLIDAYS_2026.includes(todayString);
}

/**
 * Check if a specific date is an NSE holiday
 * @param date - Date object to check
 * @returns true if the date is a holiday, false otherwise
 */
export function isHoliday(date: Date): boolean {
  const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD format

  return NSE_HOLIDAYS_2026.includes(dateString);
}

/**
 * Get all NSE holidays for 2026
 * @returns Array of holiday date strings in YYYY-MM-DD format
 */
export function getNSEHolidays2026(): string[] {
  return [...NSE_HOLIDAYS_2026];
}
