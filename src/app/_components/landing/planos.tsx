"use client";

import * as React from "react";
import { Check, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LandingConteudo } from "@/lib/landing-config";
import { CtaLink, Reveal, Section, SectionHeading, type Cta } from "./primitivos";

export interface PlanoPublico {
  nome: string;
  preco: number;
  moeda: string;
  descricao: string | null;
  modulos: string[];
  iaIncluida: boolean;
}

function formatarPreco(preco: number, moeda: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda || "BRL",
    maximumFractionDigits: Number.isInteger(preco) ? 0 : 2,
  }).format(preco);
}

/**
 * PREÇO NUNCA É FIXO AQUI. Os cartões são montados a partir dos planos ativos
 * cadastrados pelo Super Admin (`/api/landing-config`). Sem plano cadastrado,
 * a seção mostra um convite ao contato — jamais um valor inventado.
 */
export function Planos({
  conteudo,
  planos,
}: {
  conteudo: LandingConteudo;
  planos: PlanoPublico[];
}) {
  const { planosSecao } = conteudo;
  const contato = conteudo.marca.whatsappContato || "#contato";

  // Com 2+ planos, o segundo é o "mais escolhido" — convenção de página de
  // preços: o meio da escala é o que se quer vender.
  const indiceDestaque = planos.length >= 2 ? 1 : -1;

  return (
    <Section id="planos" className="pf-aurora">
      <Reveal>
        <SectionHeading
          eyebrow={planosSecao.eyebrow}
          titulo={planosSecao.titulo}
          descricao={planosSecao.descricao}
        />
      </Reveal>

      {planos.length === 0 ? (
        <Reveal delay={110}>
          <div className="pf-glass mx-auto mt-14 max-w-xl rounded-3xl p-8 text-center">
            <span className="pf-glow mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand text-brand-foreground">
              <Flame className="h-6 w-6" aria-hidden />
            </span>
            <h3 className="pf-display mt-5 text-xl font-semibold">Planos sob medida</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Montamos a combinação de módulos junto com você, de acordo com o tamanho e o tipo da
              sua operação.
            </p>
            <CtaLink
              cta={{ rotulo: "Falar com um especialista", href: contato, variante: "primary" }}
              className="mt-6"
            />
          </div>
        </Reveal>
      ) : (
        <div
          className={cn(
            "mt-14 grid gap-5",
            planos.length === 2 ? "md:grid-cols-2" : "lg:grid-cols-3",
          )}
        >
          {planos.map((plano, i) => {
            const destacado = i === indiceDestaque;
            const cta: Cta = {
              rotulo: plano.preco > 0 ? "Começar agora" : "Falar com um especialista",
              href: contato,
              variante: destacado ? "primary" : "outline",
            };
            const recursos = [
              ...plano.modulos,
              ...(plano.iaIncluida ? ["Copiloto com IA incluído"] : []),
            ];

            return (
              <Reveal key={plano.nome} delay={i * 110}>
                <article
                  className={cn(
                    "relative flex h-full flex-col rounded-3xl p-7",
                    destacado
                      ? "pf-glow border border-brand/50 bg-card lg:-mt-4 lg:pb-11"
                      : "pf-glass",
                  )}
                >
                  {destacado ? (
                    <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-foreground">
                      Mais escolhido
                    </span>
                  ) : null}
                  <h3 className="pf-display text-lg font-semibold">{plano.nome}</h3>
                  {plano.descricao ? (
                    <p className="mt-2 text-sm text-muted-foreground">{plano.descricao}</p>
                  ) : null}
                  <p className="mt-6 flex items-baseline gap-1">
                    <span className="pf-display tabular text-3xl font-semibold sm:text-4xl">
                      {plano.preco > 0 ? formatarPreco(plano.preco, plano.moeda) : "Sob consulta"}
                    </span>
                    {plano.preco > 0 ? (
                      <span className="text-sm text-muted-foreground">/mês</span>
                    ) : null}
                  </p>
                  {recursos.length ? (
                    <ul className="mt-6 flex-1 space-y-3">
                      {recursos.map((recurso) => (
                        <li
                          key={recurso}
                          className="flex items-start gap-2.5 text-sm text-muted-foreground"
                        >
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                          {recurso}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="flex-1" />
                  )}
                  <CtaLink cta={cta} className="mt-8 w-full" />
                </article>
              </Reveal>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------- CTA final -- */

export function CtaFinal({ conteudo }: { conteudo: LandingConteudo }) {
  const { ctaFinal } = conteudo;
  const contato = conteudo.marca.whatsappContato || "#planos";

  return (
    <Section id="contato">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] border border-brand/30 bg-card/60 px-6 py-14 text-center sm:px-12">
          <div className="pf-aurora absolute inset-0 -z-10 opacity-90" aria-hidden />
          <h2 className="pf-display mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl">
            {ctaFinal.titulo}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            {ctaFinal.descricao}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <CtaLink cta={{ rotulo: "Começar agora", href: contato, variante: "primary" }} />
            <CtaLink cta={{ rotulo: "Entrar", href: "/login", variante: "outline" }} />
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

/* ----------------------------------------------------------------- Rodapé -- */

export function Rodape({ conteudo }: { conteudo: LandingConteudo }) {
  const { rodape, marca } = conteudo;
  // Ano no cliente evita divergência de hidratação entre servidor e navegador
  // quando os dois estão em fusos diferentes.
  const [ano, setAno] = React.useState<number | null>(null);
  React.useEffect(() => setAno(new Date().getFullYear()), []);

  return (
    <footer className="border-t border-border px-5 py-14 sm:px-8">
      <div className="mx-auto grid w-full max-w-6xl gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-sm">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground">
              {marca.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={marca.logoUrl} alt={marca.nome} className="h-9 w-9 rounded-xl object-cover" />
              ) : (
                <Flame className="h-5 w-5" aria-hidden />
              )}
            </span>
            <span className="pf-display truncate text-lg font-semibold">{marca.nome}</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{rodape.descricao}</p>
        </div>

        {rodape.colunas.map((coluna) => (
          <div key={coluna.titulo}>
            <h3 className="text-sm font-semibold text-foreground">{coluna.titulo}</h3>
            <ul className="mt-4 space-y-2.5">
              {coluna.links.map((link) => (
                <li key={link.rotulo + link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-brand"
                  >
                    {link.rotulo}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-12 flex w-full max-w-6xl flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {ano ?? ""} {marca.nome}. Todos os direitos reservados.</p>
        <p>{marca.tagline}</p>
      </div>
    </footer>
  );
}
