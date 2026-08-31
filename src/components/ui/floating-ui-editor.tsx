"use client";

import * as React from "react";
import { Settings, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "pf-ui-scale";
const CUSTOM_KEY = "pf-ui-custom-heights";

interface HeightVars {
  btnSm: string;
  btnMd: string;
  btnLg: string;
  toggleMd: string;
  toggleSm: string;
  stepper: string;
}

const defaults: HeightVars = {
  btnSm: "32", btnMd: "36", btnLg: "40",
  toggleMd: "36", toggleSm: "28", stepper: "32",
};

function loadCustom(): HeightVars {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return { ...defaults };
}

function saveCustom(v: HeightVars) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(v)); } catch {}
}

function applyVars(v: HeightVars) {
  const s = document.documentElement.style;
  s.setProperty("--btn-h-sm", v.btnSm + "px");
  s.setProperty("--btn-h-md", v.btnMd + "px");
  s.setProperty("--btn-h-lg", v.btnLg + "px");
  s.setProperty("--btn-h-xl", (parseInt(v.btnLg) + 12) + "px");
  s.setProperty("--btn-h-sm-dk", (parseInt(v.btnSm) - 4) + "px");
  s.setProperty("--btn-h-md-dk", (parseInt(v.btnMd) - 4) + "px");
  s.setProperty("--btn-h-lg-dk", (parseInt(v.btnLg) - 4) + "px");
  s.setProperty("--btn-h-xl-dk", (parseInt(v.btnLg) + 4) + "px");
  s.setProperty("--toggle-h-md", v.toggleMd + "px");
  s.setProperty("--toggle-h-md-dk", (parseInt(v.toggleMd) - 8) + "px");
  s.setProperty("--toggle-h-sm", v.toggleSm + "px");
  s.setProperty("--toggle-h-sm-dk", (parseInt(v.toggleSm) - 4) + "px");
  s.setProperty("--stepper-btn", v.stepper + "px");
  s.setProperty("--stepper-btn-dk", (parseInt(v.stepper) - 4) + "px");
}

function applyScalePreset(preset: string) {
  document.documentElement.setAttribute("data-ui-scale", preset);
  try { localStorage.setItem(STORAGE_KEY, preset); } catch {}
}

function HeightSlider({
  label, value, onChange, min = 20, max = 72,
}: {
  label: string; value: string; onChange: (v: string) => void;
  min?: number; max?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[11px] text-neutral-400 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 h-1.5 accent-amber-400 cursor-pointer"
      />
      <span className="w-10 text-right text-[11px] text-neutral-300 tabular">{value}px</span>
    </div>
  );
}

export function FloatingUIEditor() {
  const [open, setOpen] = React.useState(false);
  const [heights, setHeights] = React.useState<HeightVars>(defaults);
  const [scale, setScale] = React.useState("normal");

  React.useEffect(() => {
    setHeights(loadCustom());
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ["compacto", "normal", "ampliado"].includes(saved)) setScale(saved);
  }, []);

  React.useEffect(() => {
    if (open) applyVars(heights);
  }, [open, heights]);

  function updateHeight(key: keyof HeightVars, val: string) {
    const next = { ...heights, [key]: val };
    setHeights(next);
    saveCustom(next);
    applyVars(next);
  }

  function applyPreset(p: string) {
    setScale(p);
    applyScalePreset(p);
    const presetMap: Record<string, HeightVars> = {
      compacto: { btnSm: "28", btnMd: "32", btnLg: "36", toggleMd: "32", toggleSm: "24", stepper: "28" },
      normal:   { btnSm: "32", btnMd: "36", btnLg: "40", toggleMd: "36", toggleSm: "28", stepper: "32" },
      ampliado: { btnSm: "36", btnMd: "44", btnLg: "52", toggleMd: "44", toggleSm: "36", stepper: "40" },
    };
    const next = presetMap[p] ?? defaults;
    setHeights(next);
    saveCustom(next);
    applyVars(next);
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed top-28 right-4 z-[9999] flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-all duration-200",
          "bg-neutral-900 text-amber-400 border border-neutral-700 hover:bg-neutral-800 hover:scale-105",
          open && "bg-amber-400 text-neutral-900"
        )}
        title="Ajustar UI"
      >
        {open ? <X className="h-5 w-5" /> : <Settings className="h-5 w-5" />}
      </button>

      {/* Editor panel */}
      {open && (
        <div className="fixed top-40 right-4 z-[9998] w-72 rounded-xl border border-neutral-700 bg-neutral-900/95 backdrop-blur-md shadow-2xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-100">Ajustar Botões</h3>
            <span className="text-[10px] text-neutral-500">Preview ao vivo</span>
          </div>

          {/* Presets */}
          <div>
            <p className="text-[10px] text-neutral-500 mb-1.5 uppercase tracking-wider">Escala</p>
            <div className="flex gap-1.5">
              {(["compacto", "normal", "ampliado"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={cn(
                    "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-all",
                    scale === p
                      ? "border-amber-400 bg-amber-400/15 text-amber-300"
                      : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-500"
                  )}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Height sliders */}
          <div className="space-y-2.5">
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Alturas personalizadas</p>
            <HeightSlider label="Btn SM" value={heights.btnSm} onChange={(v) => updateHeight("btnSm", v)} />
            <HeightSlider label="Btn MD" value={heights.btnMd} onChange={(v) => updateHeight("btnMd", v)} />
            <HeightSlider label="Btn LG" value={heights.btnLg} onChange={(v) => updateHeight("btnLg", v)} />
            <HeightSlider label="Toggle MD" value={heights.toggleMd} onChange={(v) => updateHeight("toggleMd", v)} />
            <HeightSlider label="Toggle SM" value={heights.toggleSm} onChange={(v) => updateHeight("toggleSm", v)} />
            <HeightSlider label="Stepper" value={heights.stepper} onChange={(v) => updateHeight("stepper", v)} />
          </div>

          {/* Live preview buttons */}
          <div>
            <p className="text-[10px] text-neutral-500 mb-1.5 uppercase tracking-wider">Preview</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold text-xs"
                style={{ height: "var(--btn-h-sm)", paddingLeft: 10, paddingRight: 10 }}>
                SM
              </span>
              <span className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold text-xs"
                style={{ height: "var(--btn-h-md)", paddingLeft: 14, paddingRight: 14 }}>
                MD
              </span>
              <span className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold text-sm"
                style={{ height: "var(--btn-h-lg)", paddingLeft: 16, paddingRight: 16 }}>
                LG
              </span>
              <span className="inline-flex items-center justify-center rounded-lg border-2 border-primary bg-primary-50 text-primary-700 font-semibold text-xs"
                style={{ height: "var(--toggle-h-md)", paddingLeft: 12, paddingRight: 12 }}>
                Toggle
              </span>
              <span className="inline-flex items-center justify-center rounded-full border border-border text-muted-foreground"
                style={{ width: "var(--stepper-btn)", height: "var(--stepper-btn)", fontSize: 14 }}>
                +
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
