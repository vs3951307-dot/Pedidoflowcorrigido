"use client";

import * as React from "react";
import QRCode from "qrcode";

/**
 * QR Code real (biblioteca `qrcode`, geração local — não depende de
 * serviço externo). Usado para o código que o entregador escaneia
 * (`pedidoflow:v1:entrega:<codigoQr>`, ver `/api/entregas/confirmar-codigo`).
 */
export function CodigoQr({
  valor,
  tamanho = 96,
  className,
}: {
  valor: string;
  tamanho?: number;
  className?: string;
}) {
  const [src, setSrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    let ativo = true;
    QRCode.toDataURL(valor, { width: tamanho, margin: 1 })
      .then((url) => {
        if (ativo) setSrc(url);
      })
      .catch(() => {
        if (ativo) setSrc(null);
      });
    return () => {
      ativo = false;
    };
  }, [valor, tamanho]);

  if (!src) {
    return (
      <div
        className={className}
        style={{ width: tamanho, height: tamanho }}
        aria-hidden="true"
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`QR Code: ${valor}`} width={tamanho} height={tamanho} className={className} />;
}
