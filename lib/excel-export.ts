export type ColDef = {
  header: string;
  key: string;
  width: number;
  align?: "left" | "center" | "right";
};

export type SheetDef = {
  name: string;
  columns: ColDef[];
  rows: Record<string, string | number | null | undefined>[];
};

const TEAL   = "FF0F766E";
const WHITE  = "FFFFFFFF";
const ROW_A  = "FFFFFFFF";
const ROW_B  = "FFF8FAFC";
const BORDER = "FFE2E8F0";
const TEXT   = "FF1E293B";

export async function exportStyledExcel(sheets: SheetDef[], filename: string) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Market Analyzer";

  const side = { style: "thin" as const, color: { argb: BORDER } };
  const border = { top: side, left: side, bottom: side, right: side };

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    ws.columns = sheet.columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));

    const headerRow = ws.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell, colIdx) => {
      const col = sheet.columns[colIdx - 1];
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
      cell.font = { bold: true, color: { argb: WHITE }, size: 11, name: "Calibri" };
      cell.alignment = { vertical: "middle", horizontal: col?.align ?? "center" };
      cell.border = border;
    });

    sheet.rows.forEach((rowData, idx) => {
      const row = ws.addRow(rowData);
      const bg = idx % 2 === 0 ? ROW_A : ROW_B;
      row.height = 20;
      row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
        const col = sheet.columns[colIdx - 1];
        const val = col ? rowData[col.key] : undefined;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.font = { size: 10, name: "Calibri", color: { argb: TEXT } };
        cell.alignment = {
          vertical: "middle",
          horizontal: col?.align ?? (typeof val === "number" ? "right" : "left"),
        };
        cell.border = border;
      });
    });

    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}
