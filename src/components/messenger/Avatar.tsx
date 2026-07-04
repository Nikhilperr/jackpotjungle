import { toCDNUrl } from "@/config";

export function Avatar({
  name = "Friend",
  url,
  size = 48,
  isGroup = false,
}: {
  name?: string;
  url?: string | null;
  size?: number;
  isGroup?: boolean;
}) {
  const safeName = typeof name === "string" && name.trim() !== "" ? name : "Friend";
  const initials = safeName.slice(0, 2).toUpperCase();
  const hasValidUrl = url && url !== "null" && url !== "undefined" && url.trim() !== "";
  const finalUrl = hasValidUrl ? toCDNUrl(url) : (isGroup ? "/groop.png" : null);

  return finalUrl ? (
    <img src={finalUrl} alt={safeName} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div
      className="rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}
