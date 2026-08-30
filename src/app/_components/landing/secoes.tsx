"use client";

import * as React from "react";
import { Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LandingConteudo } from "@/lib/landing-config";
import { iconeDaLanding } from "./icones";
import { CtaLink, Reveal, Section, SectionHeading, type Cta } from "./primitivos";

const IMAGEM_HERO_PADRAO = "/landing/hero-3d.jpg";

/* ------------------------------------------------------------------ Hero -- */

export function Hero({ conteudo }: { conteudo: LandingConteudo }) {
  const { hero, heroEstatisticas } = conteudo;

  // O título vem editável do painel; destacamos em gradiente a última oração
  // após o último ponto final — assim funciona com qualquer texto digitado,
  // sem exigir que o Super Admin marque nada.
  const partes = hero.titulo.split(". ");
  const destaque = partes.length > 1 ? partes.pop()! : "";
  const inicio = partes.length ? partes.join(". ") + (destaque ? ". " : "") : hero.titulo;

  const acoes: Cta[] = [
    { rotulo: "Conheça o PedidoFlow", href: "#recursos", variante: "primary" },
    { rotulo: "Ver planos", href: "#planos", variante: "outline" },
    { rotulo: "Entrar", href: "/login", variante: "ghost" },
  ];

  return (
    <section
      id="topo"
      className="pf-aurora relative overflow-hidden px-5 pb-16 pt-32 sm:px-8 md:pb-24 md:pt-40"
    >
      <div className="pf-grid absolute inset-0 -z-10 opacity-60" aria-hidden />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <Reveal>
            <span className="inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
              {hero.eyebrow}
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="pf-display mt-5 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              {inicio}
              {destaque ? (
                <span className="bg-gradient-to-r from-brand to-accent2 bg-clip-text text-transparent">
                  {destaque}
                </span>
              ) : null}
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {hero.subtitulo}
            </p>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground/80">
              {hero.apoio}
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {acoes.map((acao) => (
                <CtaLink key={acao.rotulo} cta={acao} />
              ))}
            </div>
          </Reveal>
          {heroEstatisticas.length ? (
            <Reveal delay={320}>
              <dl className="mt-12 grid grid-cols-3 gap-4 border-t border-border pt-6">
                {heroEstatisticas.map((estatistica) => (
                  <div key={estatistica.rotulo} className="min-w-0">
                    <dt className="sr-only">{estatistica.rotulo}</dt>
                    <dd className="pf-display text-xl font-semibold text-foreground sm:text-2xl">
                      {estatistica.valor}
                    </dd>
                    <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{estatistica.rotulo}</p>
                  </div>
                ))}
              </dl>
            </Reveal>
          ) : null}
        </div>

        <Reveal delay={200} className="relative">
          <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-brand/20 blur-3xl" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.imagemUrl || IMAGEM_HERO_PADRAO}
            alt={`Painel do ${conteudo.marca.nome} em notebook e celular`}
            width={1440}
            height={1088}
            className="pf-elevated pf-float w-full rounded-3xl border border-border/70"
          />
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Recursos -- */

export function Recursos({ conteudo }: { conteudo: LandingConteudo }) {
  const { recursos } = conteudo;
  return (
    <Section id="recursos">
      <Reveal>
        <SectionHeading
          eyebrow={recursos.eyebrow}
          titulo={recursos.titulo}
          descricao={recursos.descricao}
        />
      </Reveal>

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {recursos.itens.map((item, i) => {
          const Icone = iconeDaLanding(item.icone);
          return (
            <Reveal key={item.titulo} delay={(i % 3) * 90}>
              <article className="pf-glass group h-full overflow-hidden rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/15 text-brand">
                  <Icone className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="pf-display mt-5 text-lg font-semibold">{item.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.texto}</p>
                {item.imagemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imagemUrl}
                    alt=""
                    loading="lazy"
                    width={900}
                    height={900}
                    className="mt-5 h-40 w-full rounded-2xl object-cover opacity-90 transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : null}
              </article>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------- Como funciona -- */

export function ComoFunciona({ conteudo }: { conteudo: LandingConteudo }) {
  const { comoFunciona } = conteudo;
  return (
    <Section id="como-funciona" className="pf-aurora">
      <Reveal>
        <SectionHeading
          eyebrow={comoFunciona.eyebrow}
          titulo={comoFunciona.titulo}
          descricao={comoFunciona.descricao}
        />
      </Reveal>

      <ol className="relative mt-14 grid gap-6 md:grid-cols-4">
        <div
          className="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent md:block"
          aria-hidden
        />
        {comoFunciona.passos.map((passo, i) => (
          <Reveal key={passo.numero} delay={i * 110}>
            <li className="pf-glass relative h-full rounded-3xl p-6">
              <span className="pf-display pf-glow grid h-10 w-10 place-items-center rounded-full bg-brand text-sm font-bold text-brand-foreground">
                {passo.numero}
              </span>
              <h3 className="pf-display mt-5 text-lg font-semibold">{passo.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{passo.texto}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}

/* ---------------------------------------------------------- Dispositivos -- */

export function Dispositivos({ conteudo }: { conteudo: LandingConteudo }) {
  const { dispositivos } = conteudo;
  return (
    <Section id="dispositivos">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <SectionHeading
            alinhamento="esquerda"
            eyebrow={dispositivos.eyebrow}
            titulo={dispositivos.titulo}
            descricao={dispositivos.descricao}
          />
          <ul className="mt-8 space-y-3">
            {dispositivos.itens.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-sm text-muted-foreground sm:text-base"
              >
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
                  <Check className="h-3 w-3" aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={140} className="relative">
          <div className="absolute -inset-8 -z-10 rounded-full bg-accent2/15 blur-3xl" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dispositivos.imagemUrl || "/landing/devices-3d.jpg"}
            alt={`${conteudo.marca.nome} em notebook e celular`}
            loading="lazy"
            width={1440}
            height={960}
            className="pf-elevated w-full rounded-3xl border border-border/70"
          />
        </Reveal>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ Benefícios -- */

export function Beneficios({ conteudo }: { conteudo: LandingConteudo }) {
  const { beneficios } = conteudo;
  return (
    <Section id="beneficios" className="pf-aurora">
      <Reveal>
        <SectionHeading eyebrow={beneficios.eyebrow} titulo={beneficios.titulo} />
      </Reveal>
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {beneficios.itens.map((item, i) => {
          const Icone = iconeDaLanding(item.icone);
          return (
            <Reveal key={item.titulo} delay={i * 90}>
              <article className="h-full rounded-3xl border border-border bg-card/50 p-6 transition-colors hover:border-brand/40">
                <Icone className="h-6 w-6 text-brand" aria-hidden />
                <h3 className="pf-display mt-4 text-base font-semibold">{item.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.texto}</p>
              </article>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ Depoimentos -- */

export function Depoimentos({ conteudo }: { conteudo: LandingConteudo }) {
  const { depoimentos } = conteudo;
  if (!depoimentos.itens.length) return null;

  return (
    <Section id="depoimentos">
      <Reveal>
        <SectionHeading eyebrow={depoimentos.eyebrow} titulo={depoimentos.titulo} />
        {depoimentos.aviso ? (
          <p className="mx-auto mt-4 max-w-xl text-center text-xs text-muted-foreground">
            {depoimentos.aviso}
          </p>
        ) : null}
      </Reveal>

      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {depoimentos.itens.map((item, i) => (
          <Reveal key={item.nome} delay={i * 110}>
            <figure className="pf-glass flex h-full flex-col rounded-3xl p-6">
              <div className="flex gap-1" aria-label={`Avaliação ${item.nota} de 5`}>
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star
                    key={s}
                    className={cn(
                      "h-4 w-4",
                      s < item.nota ? "fill-brand text-brand" : "text-muted-foreground/40",
                    )}
                    aria-hidden
                  />
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">
                “{item.texto}”
              </blockquote>
              <figcaption className="mt-6 flex min-w-0 items-center gap-3 border-t border-border pt-5">
                <span className="pf-display grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand/15 text-sm font-semibold text-brand">
                  {item.iniciais}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {item.nome}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{item.empresa}</span>
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
