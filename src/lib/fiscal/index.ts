/**
 * Módulo fiscal (PEDIDO 19) — NFC-e via provedor/API compatível.
 *
 * Exporta o motor fiscal usado pelas rotas de API e pelo fluxo de
 * pagamento. Nenhuma função fabrica sucesso: os status refletem a
 * resposta real do provedor/SEFAZ (ou a ausência de configuração).
 */

export * from "@/lib/fiscal/chave";
export * from "@/lib/fiscal/tipos";
export * from "@/lib/fiscal/config";
export * from "@/lib/fiscal/payload";
export * from "@/lib/fiscal/emissao";
export * from "@/lib/fiscal/consulta";
export * from "@/lib/fiscal/provedor";
