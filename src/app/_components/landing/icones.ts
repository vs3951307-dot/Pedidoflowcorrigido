import {
  BarChart3,
  Bike,
  Bot,
  Boxes,
  Building2,
  Circle,
  CircleDollarSign,
  Eye,
  Layers,
  LayoutGrid,
  Monitor,
  Package,
  Phone,
  ScrollText,
  ShoppingBag,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react";

/**
 * O conteúdo da landing é editável e chega como JSON (banco → Super Admin),
 * então o ícone viaja como CHAVE, nunca como componente. Este mapa é o único
 * lugar que traduz chave → componente; chave desconhecida cai em `Circle`,
 * de modo que um erro de digitação no painel jamais derruba a página.
 *
 * Só entram aqui ícones já usados em outros pontos do projeto — garantia de
 * que existem na versão de `lucide-react` fixada no package.json.
 */
export const ICONES_LANDING: Record<string, LucideIcon> = {
  vendas: ShoppingBag,
  pedidos: ScrollText,
  salao: LayoutGrid,
  retirada: Package,
  delivery: Bike,
  atendimento: Phone,
  admin: Layers,
  relatorios: BarChart3,
  ia: Sparkles,
  automacoes: Bot,
  dispositivos: Monitor,
  multiunidades: Building2,
  tempo: Timer,
  dinheiro: CircleDollarSign,
  organizacao: Boxes,
  visao: Eye,
};

export function iconeDaLanding(chave: string): LucideIcon {
  return ICONES_LANDING[chave] ?? Circle;
}
