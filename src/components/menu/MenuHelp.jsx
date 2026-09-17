import { GraduationCap } from "lucide-react";
import { MenuButton, ViewTitle } from "./MenuPrimitives";
export default function MenuHelp({ t, onRedoTutorial }) { return <><ViewTitle>{t.help}</ViewTitle><MenuButton icon={GraduationCap} onClick={onRedoTutorial}>{t.redoTutorial}</MenuButton></>; }
