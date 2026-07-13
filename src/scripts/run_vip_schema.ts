import { ensureVipRewardSchema } from "../lib/api/vip-reward-engine/approval.functions";
import dns from "dns";

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

async function main() {
  console.log("Starting VIP Schema auto-healing and deployment...");
  try {
    await ensureVipRewardSchema();
    console.log("VIP Schema synchronization completed successfully!");
    process.exit(0);
  } catch (err: any) {
    console.error("VIP Schema migration failed:", err.message || err);
    process.exit(1);
  }
}

main();
