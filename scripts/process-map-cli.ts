// Renders the Essential Reading maps: --preview for an HTML page to look at,
// --sql for the UPDATE statements that put them into the pages.
import { previewHtml, sqlStatements } from "./process-map-content";
process.stdout.write(process.argv[2] === "--sql" ? sqlStatements() : previewHtml());
