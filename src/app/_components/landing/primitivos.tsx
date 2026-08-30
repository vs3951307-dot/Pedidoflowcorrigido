"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type CtaVariante = "primary" | "outline" | "ghost";
export interface Cta {
  rotulo: string;
  href: string;
  variante?: CtaVariante;
}

export function Section({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("relative px-5 py-20 sm:px-8 md:py-28", className)}>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  titulo,
  descricao,
  alinhamento = "centro",
}: {
  eyebrow?: string;
  titulo: string;
  descricao?: string;
  alinhamento?: "centro" | "esquerda";
}) {
  return (
    <div className={cn("max-w-2xl", alinhamento === "centro" && "mx-auto text-center")}>
      {eyebrow ? (
        <span className="inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          {eyebrow}
        </span>
      ) : null}
      <h2 className="pf-display mt-4 text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
        {titulo}
      </h2>
      {descricao ? (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">{descricao}</p>
      ) : null}
    </div>
  );
}

const ESTILO_CTA: Record<CtaVariante, string> = {
  primary: "pf-glow bg-brand text-brand-foreground hover:brightness-110 hover:-translate-y-0.5",
  outline:
    "border border-border bg-card/60 text-foreground backdrop-blur hover:border-brand/50 hover:-translate-y-0.5",
  ghost: "text-muted-foreground hover:text-foreground",
};

export function CtaLink({ cta, className }: { cta: Cta; className?: string }) {
  return (
    <a
      href={cta.href}
      className={cn(
        "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-all duration-300",
        ESTILO_CTA[cta.variante ?? "primary"],
        className,
      )}
    >
      {cta.rotulo}
    </a>
  );
}

/**
 * Revela o conteúdo ao entrar na viewport. Começa visível quando não há
 * `IntersectionObserver` — a página nunca fica em branco por causa da animação.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisivel(true);
      return;
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting) {
            setVisivel(true);
            observador.disconnect();
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:transition-none",
        visivel ? "translate-y-0 opacity-100 blur-0" : "translate-y-8 opacity-0 blur-[2px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
