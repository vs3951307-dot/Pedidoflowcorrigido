import { exigirRota } from "@/lib/acesso";

/**
 * Guarda de módulo (PEDIDO 34: "não basta esconder botão. API e página
 * devem bloquear"). Antes, esta rota não tinha layout próprio — só
 * herdava `exigirRota("admin")` do layout pai, que não checa módulo
 * nenhum. Uma empresa sem o módulo Estoque contratado conseguia acessar
 * `/admin/estoque` normalmente; só as chamadas de API internas
 * falhavam, numa experiência confusa (tela carregando, erro solto).
 * Agora a página inteira redireciona antes de renderizar.
 */
export default async function EstoqueLayout({ children }: { children: React.ReactNode }) {
  await exigirRota("estoque");
  return children;
}
