import { exigirRota, ROTULOS_PAPEL, recursosDoPapel } from "@/lib/acesso";
import { sessaoValida } from "@/lib/auth";
import { HomeCliente } from "@/app/_components/home-cliente";
import { LandingPage } from "@/app/_components/landing";

// Ícones por nome: funções não serializam de server → client, então o
// server envia a chave e o client resolve o componente.
const MODULOS_POR_RECURSO = {
  pdv: { icon: "monitor", title: "PDV", description: "Caixa, comandas e pagamentos do salão.", href: "/pdv" },
  salao: { icon: "utensils", title: "Garçom", description: "Anote pedidos e acompanhe as mesas em tempo real.", href: "/garcom" },
  entregas: { icon: "bike", title: "Entregador", description: "Rotas do dia e status das entregas em andamento.", href: "/entregador" },
  kds: { icon: "chef", title: "Cozinha", description: "Pedidos em produção, do recebimento ao pronto.", href: "/cozinha" },
  admin: { icon: "crown", title: "Administrador", description: "Dashboard, estoque, relatórios, equipe e configurações.", href: "/admin" },
} as const;

/**
 * `/` (PEDIDO 12/14): visitante SEM sessão vê a landing page comercial
 * ("Seu sistema, do seu jeito."); quem já está logado continua caindo
 * direto no próprio painel — comportamento 100% preservado (mesma
 * lógica de sempre, via `exigirRota`).
 */
export default async function HomePage() {
  const sessao = await sessaoValida();
  if (!sessao) {
    return <LandingPage />;
  }

  const usuario = await exigirRota("pdv", "salao", "kds", "entregas", "admin");

  const modulos = Object.entries(MODULOS_POR_RECURSO)
    .filter(([recurso]) => recursosDoPapel(usuario.papel).includes(recurso as never))
    .map(([recurso, modulo]) => {
      // ADMINISTRADOR cai direto na visão de gestão de entregas
      // (entregadores logados, entregas e relatório de pagamentos) — a
      // tela de trabalho /entregador é do papel ENTREGADOR.
      if (recurso === "entregas" && usuario.papel === "ADMINISTRADOR") {
        return {
          ...modulo,
          title: "Entregadores",
          description: "Entregadores em atividade, entregas e relatório individual de pagamentos.",
          href: "/admin/entregadores-pagamentos",
        };
      }
      return modulo;
    });

  return (
    <HomeCliente
      nome={usuario.nome}
      papel={ROTULOS_PAPEL[usuario.papel as keyof typeof ROTULOS_PAPEL] ?? usuario.papel}
      empresaId={usuario.empresaId}
      empresaNome={usuario.empresaNome}
      empresaLogoUrl={usuario.empresaLogoUrl}
      empresaTema={usuario.empresaTema}
      modulos={modulos}
    />
  );
}
