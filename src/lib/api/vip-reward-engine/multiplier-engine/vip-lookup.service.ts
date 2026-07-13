export class VipLookupService {
  /**
   * Normalizes a user's VIP status string to a clean matching key.
   * e.g. "Black Diamond" -> "black_diamond", "none" -> "none"
   */
  normalizeStatus(vipStatus?: string | null): string {
    if (!vipStatus) return "none";
    return vipStatus
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }
}
