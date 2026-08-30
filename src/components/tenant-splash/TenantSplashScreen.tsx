"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import "./splash.css";

interface TenantSplashScreenProps {
  nomeEmpresa: string;
  logoUrl?: string | null;
  corPrimaria?: string | null;
  corSecundaria?: string | null;
  mensagem?: string | null;
  onFinish: () => void;
  /** Tempo mínimo de exibição em ms (padrão: 2000). */
  durationMs?: number;
}

/**
 * Splash screen animada multi-tenant.
 * - Tela inteira, fundo escuro, identidade visual da empresa.
 * - Logo central (ou iniciais como fallback), glow, sheen, barra de progresso.
 * - Fade-out com blur ao terminar.
 * - Preserva `prefers-reduced-motion`.
 */
export function TenantSplashScreen({
  nomeEmpresa,
  logoUrl,
  corPrimaria,
  corSecundaria,
  mensagem,
  onFinish,
  durationMs = 2000,
}: TenantSplashScreenProps) {
  const [state, setState] = React.useState<"visible" | "hiding">("visible");
  const [logoError, setLogoError] = React.useState(false);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      setState("hiding");
      const fadeTimer = setTimeout(() => {
        if (mountedRef.current) onFinish();
      }, 420);
      return () => clearTimeout(fadeTimer);
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onFinish]);

  const primary = corPrimaria || "#953C2A";
  const secondary = corSecundaria || primary;

  const initials = React.useMemo(() => {
    const words = nomeEmpresa.trim().split(/\s+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return nomeEmpresa.slice(0, 2).toUpperCase();
  }, [nomeEmpresa]);

  const showLogo = logoUrl && !logoError;

  return (
    <div
      className="splash-overlay"
      data-state={state}
      style={{ backgroundColor: "#0c0a09" }}
      role="alert"
      aria-label={`Carregando ${nomeEmpresa}`}
    >
      {/* Grid de fundo */}
      <div className="splash-grid" />

      {/* Aura radial */}
      <div
        className="splash-aura"
        style={{
          background: `radial-gradient(circle, ${primary}88, ${secondary}44, transparent 70%)`,
        }}
      />

      {/* Logo */}
      <div
        className="splash-logo-wrapper"
        style={{ backgroundColor: primary }}
      >
        <div
          className="splash-glow"
          style={{ background: primary }}
        />
        {showLogo ? (
          <img
            src={logoUrl!}
            alt={nomeEmpresa}
            className="splash-logo-img"
            onError={() => setLogoError(true)}
          />
        ) : (
          <span className="splash-logo-initials">{initials}</span>
        )}
        <div className="splash-sheen" />
      </div>

      {/* Nome */}
      <h1 className="splash-nome">{nomeEmpresa}</h1>

      {/* Mensagem */}
      <p className="splash-mensagem">{mensagem || "Preparando seu sistema..."}</p>

      {/* Barra de progresso */}
      <div className="splash-progress-track">
        <div className="splash-progress-bar" style={{ background: `hsl(0 0% 100% / 0.65)` }} />
      </div>
    </div>
  );
}
