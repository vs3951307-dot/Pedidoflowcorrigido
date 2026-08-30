"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToggleButton } from "@/components/ui/toggle-button";
import { EmptyState } from "@/components/patterns/empty-state";
import { ProdutoCard } from "@/components/patterns/produto-card";
import { useApi } from "@/lib/api-cliente";
import {
  type Produto,
  type CatalogoApi,
  type SelecaoPizza,
} from "@/lib/catalogo";

interface CatalogoProdutosProps {
  onAdicionar: (produto: Produto, escolha?: SelecaoPizza) => void;
}

const CATALOGO_FALLBACK: CatalogoApi = {
  categorias: [],
  categoriasDetalhadas: [],
  produtos: [],
  adicionais: [],
  saboresDisponiveis: [],
};

interface ConfigPizza {
  acrescimoPorSaborPremium: number;
  permitirMisturarDoceSalgada?: boolean;
}

const CONFIG_PIZZA_PADRAO: ConfigPizza = {
  acrescimoPorSaborPremium: 10.0,
  permitirMisturarDoceSalgada: true,
};

/**
 * CatalogoProdutos — cardápio do PDV em tela cheia.
 *
 * Layout:
 * - Navegação por categorias no topo (scroll horizontal).
 * - Pesquisa instantânea (sem Enter) varre todos os produtos.
 * - Grid responsivo de produtos com fotos.
 *
 * Os dados vêm de GET /api/catalogo (categorias + produtos), com fallback vazio.
 */
export function CatalogoProdutos({ onAdicionar }: CatalogoProdutosProps) {
  const catalogo = useApi<CatalogoApi>("/api/catalogo", CATALOGO_FALLBACK);
  const configPizza = useApi<ConfigPizza>("/api/config/pizza", CONFIG_PIZZA_PADRAO);
  const categorias = catalogo.dados.categorias;
  const produtos = catalogo.dados.produtos.filter((p) => p.ativo !== false);

  const [busca, setBusca] = React.useState("");
  const [categoriaAtiva, setCategoriaAtiva] = React.useState<string>("");

  const termo = busca.trim().toLowerCase();
  const buscando = termo.length > 0;

  const resultados = React.useMemo(() => {
    if (!buscando) return [];
    return produtos.filter(
      (p) =>
        p.nome.toLowerCase().includes(termo) ||
        (p.descricao?.toLowerCase().includes(termo)) ||
        p.categoria.toLowerCase().includes(termo)
    );
  }, [buscando, termo, catalogo.dados]);

  const produtosExibidos = React.useMemo(() => {
    if (buscando) return resultados;
    if (!categoriaAtiva) return produtos;
    return produtos.filter((p) => p.categoria === categoriaAtiva);
  }, [buscando, categoriaAtiva, produtos, resultados]);

  const categoriaSelecionada = categoriaAtiva || categorias[0] || "";

  return (
    <Card className="flex flex-col gap-4 p-6 sm:p-8 h-full">
      {/* Pesquisa instantânea */}
      <div className="relative w-full max-w-lg">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          inputMode="search"
          placeholder="Buscar produto por nome, ingrediente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full pl-12 pr-12"
          aria-label="Pesquisar produtos"
          id="pdv-busca-produto"
          autoFocus
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca("")}
            aria-label="Limpar pesquisa"
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navegação por categorias (scroll horizontal) */}
      {!buscando && categorias.length > 0 && (
        <nav className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin" aria-label="Categorias do cardápio">
          <ToggleButton
            pressed={categoriaAtiva === ""}
            onClick={() => setCategoriaAtiva("")}
            className="shrink-0"
          >
            Todos
          </ToggleButton>
          {categorias.map((categoria) => {
            const selecionada = categoria === categoriaSelecionada;
            return (
              <ToggleButton
                key={categoria}
                pressed={selecionada}
                onClick={() => setCategoriaAtiva(categoria)}
                className="shrink-0"
              >
                {categoria}
              </ToggleButton>
            );
          })}
        </nav>
      )}

      {/* Grid de produtos */}
      <div className="flex-1 overflow-y-auto">
        {produtosExibidos.length === 0 ? (
          <EmptyState
            icon={Search}
            title={buscando ? "Nenhum produto encontrado" : "Nenhum produto nesta categoria"}
            description={
              buscando
                ? `Não encontramos nada para "${busca}". Tente outro termo.`
                : "Tente outra categoria ou pesquisa."
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {produtosExibidos.map((produto) => (
              <ProdutoCard
                key={produto.id}
                produto={produto}
                adicionais={catalogo.dados.adicionais}
                onAdicionar={onAdicionar}
                acrescimoPorSaborPremium={configPizza.dados.acrescimoPorSaborPremium}
                permitirMisturarDoceSalgada={configPizza.dados.permitirMisturarDoceSalgada}
                saboresDisponiveis={catalogo.dados.saboresDisponiveis}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
