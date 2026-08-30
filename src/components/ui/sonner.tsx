"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toasts — confirmações rápidas ("Mesa 04 aberta", "Pedido enviado à cozinha").
 * Posição no topo, texto grande, ícones coloridos por tipo (success/error/info).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "rounded-2xl border border-border bg-card shadow-lifted px-5 py-4 text-base font-medium",
          title: "font-semibold",
          description: "text-muted-foreground",
          actionButton: "rounded-lg bg-primary text-primary-foreground",
          cancelButton: "rounded-lg bg-secondary text-secondary-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
