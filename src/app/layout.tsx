import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/sonner";
import { RegistrarServiceWorker } from "@/components/registrar-service-worker";
import { UISettingsProvider } from "@/contexts/ui-settings-context";
import { FloatingUIEditor } from "@/components/ui/floating-ui-editor";
import "./globals.css";

/**
 * Tipografia: uma única família de trabalho (Geist) para toda a interface —
 * a mesma lógica da Apple/Stripe, onde a personalidade vem da escala, do
 * peso e do espaçamento, não da mistura de fontes. Geist Mono entra apenas
 * para dados tabulares: preços, números de mesa/pedido e horários.
 *
 * As fontes vêm do pacote oficial `geist` (arquivos locais, servidos com
 * `next/font/local`) — sem fetch externo no build e sem layout shift.
 */
export const metadata: Metadata = {
  title: {
    default: "PedidoFlow",
    template: "%s · PedidoFlow",
  },
  description:
    "Sistema de gestão de mesas, pedidos e delivery para restaurantes e pizzarias. Rápido, claro e fácil para qualquer idade.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PedidoFlow",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // nunca trave o zoom — acessibilidade sênior
  themeColor: "#FAF8F5",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      data-ui-scale="normal"
    >
      <body className="font-sans">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=localStorage.getItem('pf-ui-scale');if(s&&['compacto','normal','ampliado'].includes(s))document.documentElement.setAttribute('data-ui-scale',s)}catch(e){}`,
          }}
        />
        <UISettingsProvider>
          {children}
        </UISettingsProvider>
        <Toaster />
        <FloatingUIEditor />
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
