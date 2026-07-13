/**
 * ExportService
 * Handles client-side generation and downloading of CSV, Excel (XLS), and PDF documents
 * for VIP Reward History and Audit Logs. Zero-dependency implementation.
 */

// Helper to escape CSV cell values
function escapeCSV(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

// Helper to trigger file download
function triggerDownload(content: BlobPart, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Helper to generate XML Excel contents
function generateExcelXml(headers: string[], rows: any[][], sheetName: string): string {
  return `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>${sheetName}</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <meta charset="utf-8">
      <style>
        th { background-color: #10b981; color: white; font-weight: bold; padding: 6px; border: 0.5pt solid #ddd; }
        td { padding: 6px; border: 0.5pt solid #ddd; }
      </style>
    </head>
    <body>
      <table>
        <thead>
          <tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map(r => `<tr>${r.map(c => `<td>${c === null || c === undefined ? "" : c}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </body>
    </html>
  `;
}

// Helper to generate printed PDF layout
function printPdfLayout(title: string, headers: string[], rows: any[][]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const tableHeaders = headers.map(h => `<th style="text-align: left; padding: 10px; border-bottom: 2px solid #3f3f46; font-size: 11px; text-transform: uppercase;">${h}</th>`).join("");
  const tableRows = rows.map(r => `
    <tr>
      ${r.map(c => `<td style="padding: 10px; border-bottom: 1px solid #27272a; font-size: 11px; color: #d4d4d8;">${c === null || c === undefined ? "" : String(c)}</td>`).join("")}
    </tr>
  `).join("");

  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #fafafa; padding: 40px 24px; }
          .header { border-bottom: 4px solid #10b981; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 28px; font-weight: 900; letter-spacing: -0.05em; color: #fafafa; margin: 0; }
          .subtitle { font-size: 12px; text-transform: uppercase; font-weight: bold; letter-spacing: 2px; color: #a1a1aa; margin: 4px 0 0 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; }
          th { color: #10b981; }
          @media print {
            body { padding: 0; background-color: white; color: black; }
            .title { color: black; }
            th { color: #059669; border-bottom: 2px solid #e4e4e7; }
            td { color: #3f3f46; border-bottom: 1px solid #e4e4e7; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">JACKPOT JUNGLE</h1>
          <p class="subtitle">${title}</p>
        </div>
        <p style="font-size: 12px; color: #71717a;">Generated on: ${new Date().toLocaleString()}</p>
        <table>
          <thead>
            <tr>${tableHeaders}</tr>
          </thead>
          <tbody>
            ${tableRows || `<tr><td colspan="${headers.length}" style="text-align: center; padding: 30px;">No records available.</td></tr>`}
          </tbody>
        </table>
        <script>
          window.onload = function() {
            window.print();
            window.close();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Export VIP Reward History Cycles
 */
export function exportRewardHistory(cycles: any[], format: "csv" | "excel" | "pdf") {
  const headers = [
    "Month",
    "Year",
    "Status",
    "Reward Pool",
    "Total Deposits",
    "Total Cashouts",
    "Total Holding",
    "Qualified Players",
    "Distributed Amount",
    "Approved By",
    "Completed At"
  ];

  const rows = cycles.map(c => [
    c.month,
    c.year,
    c.status,
    `$${c.reward_pool.toFixed(2)}`,
    `$${c.monthly_deposits.toFixed(2)}`,
    `$${c.monthly_cashouts.toFixed(2)}`,
    `$${c.monthly_holding.toFixed(2)}`,
    c.total_qualified_players,
    `$${c.total_distributed_amount.toFixed(2)}`,
    c.approved_by_name || "N/A",
    c.completed_at ? new Date(c.completed_at).toLocaleString() : "N/A"
  ]);

  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `VIP_Reward_History_${timestamp}`;

  if (format === "csv") {
    const csvContent = [headers.join(","), ...rows.map(r => r.map(escapeCSV).join(","))].join("\n");
    triggerDownload(csvContent, `${filename}.csv`, "text/csv;charset=utf-8;");
  } else if (format === "excel") {
    const excelContent = generateExcelXml(headers, rows, "Reward Cycles");
    triggerDownload(excelContent, `${filename}.xls`, "application/vnd.ms-excel");
  } else if (format === "pdf") {
    printPdfLayout("VIP Monthly Payout Cycle History", headers, rows);
  }
}

/**
 * Export VIP Audit Logs
 */
export function exportAuditLogs(logs: any[], format: "csv" | "excel" | "pdf") {
  const headers = [
    "Timestamp",
    "Username",
    "Role",
    "Action",
    "Previous Value",
    "New Value",
    "IP Address",
    "Device / User Agent"
  ];

  const rows = logs.map(l => [
    new Date(l.created_at).toLocaleString(),
    l.username,
    l.role,
    l.action,
    l.previous_value ? JSON.stringify(l.previous_value) : "",
    l.new_value ? JSON.stringify(l.new_value) : "",
    l.ip_address || "N/A",
    l.device_info || "N/A"
  ]);

  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `VIP_Audit_Logs_${timestamp}`;

  if (format === "csv") {
    const csvContent = [headers.join(","), ...rows.map(r => r.map(escapeCSV).join(","))].join("\n");
    triggerDownload(csvContent, `${filename}.csv`, "text/csv;charset=utf-8;");
  } else if (format === "excel") {
    const excelContent = generateExcelXml(headers, rows, "Audit Logs");
    triggerDownload(excelContent, `${filename}.xls`, "application/vnd.ms-excel");
  } else if (format === "pdf") {
    printPdfLayout("VIP Reward Audit Logs", headers, rows);
  }
}

/**
 * Export VIP Player Reward History
 */
export function exportPlayerPayouts(payouts: any[], format: "csv" | "excel" | "pdf") {
  const headers = [
    "Date",
    "Username",
    "Month/Year",
    "VIP Rank",
    "Deposit Score",
    "Holding Score",
    "Referral Score",
    "Loyalty Score",
    "Base Score",
    "Multiplier",
    "Final Score",
    "Distributed Payout",
    "Status"
  ];

  const rows = payouts.map(p => [
    new Date(p.distribution_date).toLocaleString(),
    p.username,
    `${p.month}/${p.year}`,
    p.vip_status.toUpperCase(),
    Number(p.deposit_score).toFixed(2),
    Number(p.holding_score).toFixed(2),
    Number(p.referral_score).toFixed(2),
    Number(p.loyalty_score).toFixed(2),
    Number(p.base_score).toFixed(2),
    Number(p.multiplier).toFixed(2),
    Number(p.final_score).toFixed(4),
    `$${Number(p.reward_amount).toFixed(2)}`,
    p.approval_status
  ]);

  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `VIP_Player_Rewards_${timestamp}`;

  if (format === "csv") {
    const csvContent = [headers.join(","), ...rows.map(r => r.map(escapeCSV).join(","))].join("\n");
    triggerDownload(csvContent, `${filename}.csv`, "text/csv;charset=utf-8;");
  } else if (format === "excel") {
    const excelContent = generateExcelXml(headers, rows, "Player Payouts");
    triggerDownload(excelContent, `${filename}.xls`, "application/vnd.ms-excel");
  } else if (format === "pdf") {
    printPdfLayout("VIP Player Payout Distributions", headers, rows);
  }
}

/**
 * Exporter: exportVipReportData
 * General-purpose reporter export for Monthly Reward, VIP, Referral, Distribution, and Qualification reports.
 */
export function exportVipReportData(
  title: string,
  headers: string[],
  rows: any[][],
  format: "csv" | "excel" | "pdf",
  defaultFilename: string
) {
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `${defaultFilename.replace(/\s+/g, "_")}_${timestamp}`;

  if (format === "csv") {
    const csvContent = [headers.join(","), ...rows.map(r => r.map(escapeCSV).join(","))].join("\n");
    triggerDownload(csvContent, `${filename}.csv`, "text/csv;charset=utf-8;");
  } else if (format === "excel") {
    const excelContent = generateExcelXml(headers, rows, "Report Sheets");
    triggerDownload(excelContent, `${filename}.xls`, "application/vnd.ms-excel");
  } else if (format === "pdf") {
    printPdfLayout(title, headers, rows);
  }
}

