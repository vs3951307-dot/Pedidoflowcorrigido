/**
 * Papéis, recursos e permissões — parte pura (sem server-only), usada
 * tanto no backend (`src/lib/acesso.ts`) quanto nas telas (ex.: admin).
 */

export const PAPEIS = [
  "ADMINISTRADOR",
  "CAIXA",
  "GARCOM",
  "COZINHA",
  "ENTREGADOR",
] as const;

export type Papel = (typeof PAPEIS)[number];

export const ROTULOS_PAPEL: Record<Papel, string> = {
  ADMINISTRADOR: "Administrador",
  CAIXA: "Caixa",
  GARCOM: "Garçom",
  COZINHA: "Cozinha",
  ENTREGADOR: "Entregador",
};

export const RECURSOS = [
  "pdv", // vendas no balcão (PDV)
  "salao", // mesas e comandas (PDV/Salão e Garçom)
  "retirada", // pedidos de retirada (PDV)
  "pagamentos", // receber pagamentos (PDV)
  "caixa", // abrir/fechar/movimentar caixa
  "catalogo", // consultar cardápio
  "catalogo_editar", // criar/editar/desativar produtos
  "clientes", // clientes e endereços
  "kds", // painel da cozinha (produção)
  "entregas", // entregas atribuídas
  "pagamentos_entrega", // confirmar pagamento na entrega
  "admin", // dashboard e relatórios
  "estoque", // estoque e movimentações
  "notas_fiscais", // notas fiscais de entrada
  "configuracoes", // configurações da unidade
  "usuarios", // gerenciar usuários e permissões
  "auditoria", // consultar trilha de auditoria
  "backups", // backups do banco
  "impressao", // fila de impressão térmica (ver, reimprimir, cancelar)
  "atendimento", // WhatsApp: conversas, transferência para humano, simulação
  "fiscal", // NFC-e: emissão, consulta, cancelamento e configuração fiscal
] as const;

export type Recurso = (typeof RECURSOS)[number];

const PERMISSOES_POR_PAPEL: Record<Papel, Recurso[]> = {
  ADMINISTRADOR: [...RECURSOS],
  CAIXA: ["pdv", "salao", "retirada", "pagamentos", "caixa", "catalogo", "clientes", "impressao", "atendimento"],
  // Garçom recebe o pagamento da PRÓPRIA mesa pelo celular (PEDIDO: "cliente
  // chama o garçom, pede a conta, ele leva celular + maquininha") — mas
  // NÃO tem acesso ao módulo administrativo Caixa (abertura/fechamento/
  // sangria), só à confirmação de pagamento em si.
  GARCOM: ["salao", "catalogo", "pagamentos"],
  COZINHA: ["kds", "impressao"],
  ENTREGADOR: ["entregas", "pagamentos_entrega"],
};

export function ehPapelValido(valor: unknown): valor is Papel {
  return typeof valor === "string" && (PAPEIS as readonly string[]).includes(valor);
}

export function recursosDoPapel(papel: string): Recurso[] {
  return PERMISSOES_POR_PAPEL[papel as Papel] ?? [];
}

export type UsuarioComPermissoes = {
  id: string;
  nome: string;
  email: string;
  papel: string;
  ativo: boolean;
  permissaos?: { recurso: string; permitido: boolean }[];
};

/** Overrides (PermissaoUsuario) sobrepõem o padrão do papel. */
export function temPermissao(
  usuario: UsuarioComPermissoes,
  recurso: Recurso
): boolean {
  const override = usuario.permissaos?.find((p) => p.recurso === recurso);
  if (override) return override.permitido;
  return recursosDoPapel(usuario.papel).includes(recurso);
}

export function usuarioSeguro(usuario: UsuarioComPermissoes) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    ativo: usuario.ativo,
  };
}
