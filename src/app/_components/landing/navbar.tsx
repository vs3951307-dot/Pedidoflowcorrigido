"use client";

import * as React from "react";
import { Flame, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CtaLink, type Cta } from "./primitivos";
import type { LandingConteudo } from "@/lib/landing-config";

export function Navbar({ conteudo }: { conteudo: LandingConteudo }) {
  const [aberto, setAberto] = React.useState(false);
  const [rolou, setRolou] = React.useState(false);

  React.useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 24);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  const acoes: Cta[] = [
    { rotulo: "Entrar", href: "/login", variante: "ghost" },
    { rotulo: "Começar agora", href: "#planos", variante: "primary" },
  ];

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        rolou ? "border-b border-border bg-background/80 backdrop-blur-xl" : "",
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-4 sm:px-8">
        <a href="#topo" className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground">
            {conteudo.marca.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={conteudo.marca.logoUrl}
                alt={conteudo.marca.nome}
                className="h-9 w-9 rounded-xl object-cover"
              />
            ) : (
              <Flame className="h-5 w-5" aria-hidden />
            )}
          </span>
          <span className="pf-display truncate text-lg font-semibold tracking-tight">
            {conteudo.marca.nome}
          </span>
        </a>

        <nav className="ml-auto hidden items-center gap-7 lg:flex">
          {conteudo.navegacao.map((link) => (
            <a
              key={link.href + link.rotulo}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.rotulo}
            </a>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:ml-0 lg:flex">
          {acoes.map((acao) => (
            <CtaLink key={acao.rotulo} cta={acao} className="px-5 py-2.5" />
          ))}
        </div>

        <button
          type="button"
          aria-label={aberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
          className="ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border lg:hidden"
        >
          {aberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {aberto ? (
        <div className="border-t border-border bg-background/95 px-5 pb-6 pt-2 backdrop-blur-xl lg:hidden">
          <nav className="flex flex-col">
            {conteudo.navegacao.map((link) => (
              <a
                key={link.href + link.rotulo}
                href={link.href}
                onClick={() => setAberto(false)}
                className="border-b border-border/60 py-3 text-sm text-muted-foreground"
              >
                {link.rotulo}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            {acoes.map((acao) => (
              <CtaLink key={acao.rotulo} cta={acao} className="w-full" />
            ))}
          </div>
        </div>
      ) : null}
    </header>
  );
}
