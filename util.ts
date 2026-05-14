export const TAIPEI_TIME_ZONE = "Asia/Taipei";
export const taipeiDateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TAIPEI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
function toTaipeiDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return taipeiDateTimeFormatter.format(date).replace(" ", ":");
}

export default toTaipeiDateTime;
