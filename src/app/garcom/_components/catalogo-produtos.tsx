"use client";

import React from "react";
import { AlertTriangle, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/patterns/empty-state";
import { ProdutoCard } from "@/components/patterns/produto-card";
import { useApi } from "@/lib/api-cliente";
import {
  type Produto,
  type SaborPizza,
  type AdicionalPizza,
  type CatalogoApi,
} from "@/lib/catalogo";

const CATALOGO_FALLBACK: CatalogoApi = {
  categorias: [],
  categoriasDetalhadas: [],
  produtos: [],
  adicionais: [],
};

interface ConfigPizza {
  acrescimoPorSaborPremium: number;
  permitirMisturarDoceSalgada?: boolean;
}

const CONFIG_PIZZA_PADRAO: ConfigPizza = {
  acrescimoPorSaborPremium: 10.0,
  permitirMisturarDoceSalgada: true,
};

interface CatalogoProdutosProps {
  onAdicionar: (
    produto: Produto,
    escolha?: {
      tamanhoId: string;
      tamanhoNome: string;
      precoUnit: number;
      quantidade?: number;
      sabores: Produto["sabores"];
      adicionais: Produto["adicionais"];
      observacao?: string;
    }
  ) => void;
}

export function CatalogoProdutos({ onAdicionar }: CatalogoProdutosProps) {
  const catalogo = useApi<CatalogoApi>("/api/catalogo", CATALOGO_FALLBACK);
  const configPizza = useApi<ConfigPizza>("/api/config/pizza", CONFIG_PIZZA_PADRAO);
  const categorias = catalogo.dados.categorias;
  const produtos = catalogo.dados.produtos.filter((p) => p.ativo !== false);
  const adicionais = catalogo.dados.adicionais ?? [];

  const [busca, setBusca] = React.useState("");

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
  }, [buscando, termo, produtos]);

  const produtosExibidos = buscando ? resultados : produtos;

  if (catalogo.carregando) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (catalogo.erro) {
    return (
      <div className="flex flex-col items-center gap-4">
        <EmptyState
          icon={AlertTriangle}
          title="Não foi possível carregar o cardápio"
          description={`${catalogo.erro} — os produtos não foram lidos do servidor.`}
        />
        <Button variant="outline" onClick={catalogo.recarregar}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-6 sm:p-7 h-full">
      {/* Pesquisa instantânea */}
      <div className="relative w-full max-w-md">
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

      {categorias.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Cardápio vazio"
          description="Nenhum produto cadastrado ainda."
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {produtosExibidos.map((produto) => (
              <ProdutoCard
                key={produto.id}
                produto={produto}
                adicionais={adicionais}
                acrescimoPorSaborPremium={configPizza.dados.acrescimoPorSaborPremium}
                onAdicionar={(produto, escolha) => {
                  onAdicionar(produto, {
                    tamanhoId: escolha?.tamanhoId ?? "",
                    tamanhoNome: escolha?.tamanhoNome ?? "",
                    precoUnit: escolha?.precoUnit ?? produto.preco,
                    quantidade: escolha?.quantidade ?? 1,
                    sabores: escolha?.sabores ?? [],
                    adicionais: escolha?.adicionais ?? [],
                    observacao: escolha?.observacao,
                  });
                }}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
