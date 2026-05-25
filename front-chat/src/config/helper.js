export function timeAgo(date) {
  const now = new Date();
  const past = new Date(date);
  if (Number.isNaN(past.getTime())) return "Just now";

  const rawSeconds = Math.floor((now - past) / 1000);
  const secondsAgo = Math.max(0, rawSeconds);

  if (secondsAgo < 45) return "Just now";
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo} min ago`;
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo} hr ago`;
  const daysAgo = Math.floor(hoursAgo / 24);
  if (daysAgo < 30) return `${daysAgo} day${daysAgo > 1 ? "s" : ""} ago`;
  const monthsAgo = Math.floor(daysAgo / 30);
  if (monthsAgo < 12) return `${monthsAgo} month${monthsAgo > 1 ? "s" : ""} ago`;
  const yearsAgo = Math.floor(monthsAgo / 12);
  return `${yearsAgo} year${yearsAgo > 1 ? "s" : ""} ago`;
}
