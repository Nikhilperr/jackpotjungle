import { memo } from "react";
import { toCDNUrl } from "@/config";
import { CachedImage } from "./CachedImage";

function AvatarComponent({
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

  let displayUrl = finalUrl;
  if (displayUrl && (displayUrl.includes("cdn.playjackpotjungle.com") || displayUrl.includes("db.chancerealm.casino"))) {
    const resizeWidth = size * 2;
    const resizeHeight = size * 2;
    const separator = displayUrl.includes("?") ? "&" : "?";
    displayUrl = `${displayUrl}${separator}width=${resizeWidth}&height=${resizeHeight}&resize=contain`;
  }

  return displayUrl ? (
    <CachedImage
      src={displayUrl}
      alt={safeName}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
      progressive={false}
      cachePolicy="persistent"
    />
  ) : (
    <div
      className="rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}

export const Avatar = memo(AvatarComponent);

