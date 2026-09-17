import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

export const raisedShadow = "4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff";
export const insetShadow = "inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff";

export function MenuButton({ icon: Icon, children, onClick, chevron = false, prominent = false }) {
  return <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onClick} className={`flex min-h-12 w-full items-center gap-3 rounded-xl text-left font-semibold text-[#5a6a7a] ${prominent ? "p-4" : "px-4 py-3"}`} style={{ boxShadow: raisedShadow }}>
    <Icon className="h-5 w-5 shrink-0" />
    <span className="flex-1">{children}</span>
    {chevron && <ChevronRight className="h-5 w-5 text-[#8a9aa8]" aria-hidden="true" />}
  </motion.button>;
}

export function ViewTitle({ children }) {
  return <h3 className="mb-4 text-lg font-bold text-[#5a6a7a]">{children}</h3>;
}
