/**
 * Validação de imagem por CONTEÚDO real (PEDIDO 27: "não confiar
 * somente no MIME informado por base64/data URL... validar assinatura/
 * magic bytes"). Um arquivo `.exe` renomeado com um cabeçalho
 * `data:image/png;base64,` mentiroso passaria por qualquer checagem que
 * só olhasse o texto do MIME — os primeiros bytes REAIS do arquivo não
 * mentem sobre o formato.
 */

const ASSINATURAS: { mime: string; extensao: string; bytes: number[] }[] = [
  { mime: "image/png", extensao: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", extensao: "jpg", bytes: [0xff, 0xd8, 0xff] },
  // WebP: "RIFF" + 4 bytes de tamanho (variável) + "WEBP" — checa os dois
  // trechos fixos, pulando o tamanho do meio.
  { mime: "image/webp", extensao: "webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];

function bytesComecamCom(bytes: Buffer, assinatura: number[]): boolean {
  if (bytes.length < assinatura.length) return false;
  for (let i = 0; i < assinatura.length; i++) {
    if (bytes[i] !== assinatura[i]) return false;
  }
  return true;
}

export interface ImagemValidada {
  mime: string;
  extensao: string;
}

/**
 * Confere se `bytes` É DE VERDADE uma imagem JPEG/PNG/WebP, pelos
 * primeiros bytes do arquivo — ignora completamente qualquer MIME
 * declarado pelo cliente. `null` se não bater com nenhuma assinatura
 * conhecida (arquivo rejeitado).
 */
export function validarAssinaturaImagem(bytes: Buffer): ImagemValidada | null {
  for (const assinatura of ASSINATURAS) {
    if (bytesComecamCom(bytes, assinatura.bytes)) {
      if (assinatura.mime === "image/webp") {
        // RIFF genérico cobre vários formatos (WAV, AVI...) — confirma
        // que os bytes 8-11 são literalmente "WEBP" antes de aceitar.
        const marcador = bytes.subarray(8, 12).toString("ascii");
        if (marcador !== "WEBP") continue;
      }
      return { mime: assinatura.mime, extensao: assinatura.extensao };
    }
  }
  return null;
}
