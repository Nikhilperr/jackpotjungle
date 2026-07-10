import { execSync } from 'child_process';
try {
  console.log("=== PM2 LIST ===");
  console.log(execSync('pm2 list', { encoding: 'utf8' }));
  
  console.log("=== PM2 SHOW 0 ===");
  console.log(execSync('pm2 show 0', { encoding: 'utf8' }));
} catch (e) {
  console.error("Error inspecting PM2:", e.message);
}
