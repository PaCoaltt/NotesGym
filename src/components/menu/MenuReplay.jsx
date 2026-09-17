import ReplayTimeline from "@/components/statistics/ReplayTimeline";
import { ViewTitle } from "./MenuPrimitives";
export default function MenuReplay({ notes, date, onDateChange, gradingSystem, language, replayFilters, t }) { return <><ViewTitle>{t.replay}</ViewTitle><ReplayTimeline notes={notes} date={date} onDateChange={onDateChange} gradingSystem={gradingSystem} language={language} filters={replayFilters} t={t} /></>; }
