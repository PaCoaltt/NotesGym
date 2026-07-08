import React, { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Mail } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function LoginScreen() {
  const { login, authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await login(email, password);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "#e0e5eb" }}>
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl p-8"
        style={{
          backgroundColor: "#e0e5eb",
          boxShadow: "20px 20px 40px #b8bdc4, -20px -20px 40px #ffffff",
        }}
      >
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2" style={{ color: "#5a6a7a" }}>
            NotesGym
          </h1>
          <p className="text-sm" style={{ color: "#8a9aa8" }}>
            Connexion
          </p>
        </div>

        <label className="block text-sm font-medium mb-2" style={{ color: "#8a9aa8" }}>
          Email
        </label>
        <div className="relative mb-5">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: "#8a9aa8" }} />
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="username"
            className="w-full pl-12 pr-4 py-4 rounded-xl font-medium transition-all focus:outline-none"
            style={{
              backgroundColor: "#e0e5eb",
              color: "#5a6a7a",
              boxShadow: "inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff",
            }}
          />
        </div>

        <label className="block text-sm font-medium mb-2" style={{ color: "#8a9aa8" }}>
          Mot de passe
        </label>
        <div className="relative mb-6">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: "#8a9aa8" }} />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            className="w-full pl-12 pr-4 py-4 rounded-xl font-medium transition-all focus:outline-none"
            style={{
              backgroundColor: "#e0e5eb",
              color: "#5a6a7a",
              boxShadow: "inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff",
            }}
          />
        </div>

        {authError?.type === "invalid_credentials" && (
          <p className="text-sm text-center mb-4" style={{ color: "#9a5a5a" }}>
            Email ou mot de passe incorrect.
          </p>
        )}

        <motion.button
          type="submit"
          whileTap={{ scale: 0.97 }}
          disabled={isSubmitting}
          className="w-full px-6 py-4 rounded-xl font-bold transition-all"
          style={{
            backgroundColor: "#e0e5eb",
            color: isSubmitting ? "#aab4bc" : "#5a6a7a",
            boxShadow: isSubmitting
              ? "inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff"
              : "8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff",
          }}
        >
          {isSubmitting ? "Connexion..." : "Se connecter"}
        </motion.button>
      </motion.form>
    </div>
  );
}
