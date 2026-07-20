import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  // nodePolyfills() is needed only for "exceljs" (used in
  // client/src/components/BulkTargetUpload.tsx to write the bulk-upload
  // template's dropdown data validations, which SheetJS/"xlsx" can't write).
  // ExcelJS's browser build still references Node's `Buffer`/`process`
  // globals internally even though we only ever call its buffer-producing
  // write API, so without this plugin the template download throws
  // "Buffer is not defined" at runtime. No other part of the app needs it.
  plugins: [react(), nodePolyfills({ include: ["buffer", "process", "util", "stream"] })],
  server: {
    port: 5173,
  },
});
