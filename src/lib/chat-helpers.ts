export function formatSystemMessage(content: string, senderDisplayName?: string): string {
  if (!content) return "";
  
  if (content === "[system:group_created]") {
    return `${senderDisplayName || "Someone"} created the group.`;
  }
  if (content.startsWith("[system:user_left:")) {
    const name = content.slice(18, -1);
    return `${name || senderDisplayName || "Someone"} left the group.`;
  }
  if (content.startsWith("[system:user_joined:")) {
    const name = content.slice(20, -1);
    return `${name || senderDisplayName || "Someone"} joined the group.`;
  }
  if (content.startsWith("[system:ownership_transferred:")) {
    const name = content.slice(30, -1);
    return `${name || "Someone"} became the group administrator.`;
  }
  if (content.startsWith("[system:group_name_changed:")) {
    const parts = content.split(":");
    const newName = parts[2]?.replace(/\]$/, "") || "";
    const changer = parts[3]?.replace(/\]$/, "") || senderDisplayName || "Someone";
    return `${changer} changed the group name to "${newName}".`;
  }
  if (content.startsWith("[system:group_avatar_changed:")) {
    const parts = content.split(":");
    const changer = parts[2]?.replace(/\]$/, "") || senderDisplayName || "Someone";
    return `${changer} changed the group photo.`;
  }
  if (content.startsWith("[system:user_removed:")) {
    const parts = content.split(":");
    const removedName = parts[2] || "";
    const removerName = parts[3]?.replace(/\]$/, "") || senderDisplayName || "Someone";
    const cleanRemoved = removedName.startsWith("@") ? removedName.slice(1) : removedName;
    return `${removerName} removed ${cleanRemoved}.`;
  }
  if (content.startsWith("[system:user_promoted:")) {
    const parts = content.split(":");
    const promotedName = parts[2] || "";
    const promoterName = parts[3]?.replace(/\]$/, "") || senderDisplayName || "Someone";
    const cleanPromoted = promotedName.startsWith("@") ? promotedName.slice(1) : promotedName;
    return `${promoterName} promoted ${cleanPromoted} to admin.`;
  }
  if (content.startsWith("[system:user_added:")) {
    const parts = content.split(":");
    const addedName = parts[2] || "";
    const adderName = parts[3]?.replace(/\]$/, "") || senderDisplayName || "Someone";
    const cleanAdded = addedName.startsWith("@") ? addedName.slice(1) : addedName;
    return `${adderName} added ${cleanAdded}.`;
  }
  
  return content;
}

export function isSystemMessage(content: string): boolean {
  if (!content) return false;
  return (
    content === "[system:group_created]" ||
    content.startsWith("[system:user_left:") ||
    content.startsWith("[system:user_joined:") ||
    content.startsWith("[system:ownership_transferred:") ||
    content.startsWith("[system:group_name_changed:") ||
    content.startsWith("[system:group_avatar_changed:") ||
    content.startsWith("[system:user_removed:") ||
    content.startsWith("[system:user_promoted:") ||
    content.startsWith("[system:user_added:")
  );
}

/** Local calendar day key: YYYY-MM-DD */
export function calendarDayKey(iso: string | Date | null | undefined): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True when a Messenger-style day separator should appear before `current`. */
export function shouldShowDaySeparator(
  previousIso: string | Date | null | undefined,
  currentIso: string | Date | null | undefined,
): boolean {
  const cur = calendarDayKey(currentIso);
  if (!cur) return false;
  const prev = calendarDayKey(previousIso);
  return !prev || prev !== cur;
}

/**
 * Day separator label: Today / Yesterday / Jul 24 / Jul 24, 2025
 * No time — one label per calendar day.
 */
export function formatChatDaySeparator(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return "";

  const startOfLocalDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(d);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((today - target) / dayMs);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  const sameYear = d.getFullYear() === new Date().getFullYear();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = `${months[d.getMonth()]} ${d.getDate()}`;
  return sameYear ? label : `${label}, ${d.getFullYear()}`;
}

export async function downloadQRCode(link: string, filename: string) {
  try {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`;
    const response = await fetch(qrUrl);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Failed to download QR code", err);
  }
}
