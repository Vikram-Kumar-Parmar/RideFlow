# RideFlow — D3 Submission Report

Pre-built submission artifact for **Deliverable 3** of the Database Systems
semester project.

## Files

| File | Purpose |
|------|---------|
| `RideFlow_D3_Report.pdf` | The submission PDF (cover, rubric checklist, ERD, schema, SQL, screenshots, query results). |
| `report.html` | HTML source used to render the PDF. |
| `erd.png` | Auto-generated ERD (regenerated from the live schema; D3 additions labelled "D3 add"). |
| `erd.mmd` | Mermaid source for the ERD. |
| `build-pdf.mjs` | One-shot puppeteer script that rebuilds `RideFlow_D3_Report.pdf` from `report.html`. |
| `shots/` | Screenshots embedded in the PDF, captured during the recorded end-to-end test run. |

## Rebuilding the report

```bash
# (assumes you have @mermaid-js/mermaid-cli installed globally — npm i -g @mermaid-js/mermaid-cli)
mmdc -i report/erd.mmd -o report/erd.png -w 1600 -H 1400 -b transparent
node report/build-pdf.mjs
```

`build-pdf.mjs` uses the puppeteer instance bundled with `@mermaid-js/mermaid-cli`,
so no separate puppeteer install is required.

Developed by Vikram Kumar | Roll: 23K-2062 | Section: DS-4B
