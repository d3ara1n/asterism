/** Calendar comparisons use the same local timezone as the displayed timestamp, including year boundaries. */
export function messageTimeOptions(date: Date, now: Date): Intl.DateTimeFormatOptions {
  const options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  const sameYear = date.getFullYear() === now.getFullYear();
  const today = sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (!today) { options.month = "short"; options.day = "numeric"; }
  if (!sameYear) options.year = "numeric";
  return options;
}
