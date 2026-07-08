import React from "react";
import { motion } from "framer-motion";
import { X, Server, Database, Users } from "lucide-react";

export default function SelfHostModal({ onClose, t }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(224, 229, 235, 0.95)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-3xl p-8"
        style={{
          backgroundColor: "#e0e5eb",
          boxShadow: "20px 20px 40px #b8bdc4, -20px -20px 40px #ffffff",
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg"
              style={{
                backgroundColor: "#e0e5eb",
                boxShadow: "inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff",
              }}
            >
              <Server className="w-5 h-5" style={{ color: "#6a7a8a" }} />
            </div>
            <h2 className="text-xl font-bold" style={{ color: "#5a6a7a" }}>
              {t.selfHost?.title || "Auto-heberger NotesGym"}
            </h2>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="p-2 rounded-lg"
            style={{
              backgroundColor: "#e0e5eb",
              boxShadow: "4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff",
            }}
          >
            <X className="w-5 h-5" style={{ color: "#8a9aa8" }} />
          </motion.button>
        </div>

        <p className="text-sm mb-5" style={{ color: "#8a9aa8" }}>
          Cette version fonctionne entierement sur votre serveur : interface, comptes et donnees.
        </p>

        <div className="space-y-3">
          {[
            { icon: Server, title: "Docker", desc: "Un seul conteneur leger pour Raspberry Pi 5." },
            { icon: Database, title: "Donnees locales", desc: "Les notes sont conservees dans un volume persistant." },
            { icon: Users, title: "Comptes locaux", desc: "Les utilisateurs sont crees depuis la configuration." },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{
                backgroundColor: "#e0e5eb",
                boxShadow: "inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff",
              }}
            >
              <item.icon className="w-5 h-5 mt-0.5" style={{ color: "#6a7a8a" }} />
              <div>
                <p className="font-medium" style={{ color: "#5a6a7a" }}>
                  {item.title}
                </p>
                <p className="text-sm" style={{ color: "#8a9aa8" }}>
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
