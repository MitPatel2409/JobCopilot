/** Desktop notifications through the browser. They need the user's permission once. */

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function showNotification(title, body) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  const notification = new Notification(title, { body, icon: "/favicon.svg" });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
