import { Archive, FileSpreadsheet, FileUp } from "lucide-react";
import { MenuButton, ViewTitle } from "./MenuPrimitives";
export default function MenuData({ t, fileInputRef, onExport, onImport, onArchive }) {
  return <><ViewTitle>{t.data}</ViewTitle><div className="space-y-3"><MenuButton icon={FileSpreadsheet} onClick={onExport}>{t.export}</MenuButton><input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ""; }} /><MenuButton icon={FileUp} onClick={() => fileInputRef.current?.click()}>{t.import}</MenuButton><MenuButton icon={Archive} onClick={onArchive}>{t.archiveButton}</MenuButton></div></>;
}
