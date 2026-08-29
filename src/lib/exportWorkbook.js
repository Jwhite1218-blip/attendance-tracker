// Thin browser-only wrapper around SheetJS. Kept separate from the pure data
// builders (dailyReport.js, employeeHistoryExport.js) so those stay
// unit-testable without a DOM/SheetJS dependency.
//
// xlsx is ~330kB and only needed by the handful of people who click an
// export button, so it's dynamically imported here rather than bundled into
// the main chunk everyone downloads on every page load.

// sheets: [{ name: 'Sheet1', rows: [{ Col: value, ... }], headerRows: [['A note above the header'], []] }]
export async function downloadWorkbook(filename, sheets) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()

  sheets.forEach(sheet => {
    const worksheet = sheet.headerRows?.length
      ? XLSX.utils.aoa_to_sheet(sheet.headerRows)
      : XLSX.utils.json_to_sheet(sheet.rows)

    if (sheet.headerRows?.length) {
      XLSX.utils.sheet_add_json(worksheet, sheet.rows, {
        origin: -1,
        skipHeader: false,
      })
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31))
  })

  XLSX.writeFile(workbook, filename)
}
