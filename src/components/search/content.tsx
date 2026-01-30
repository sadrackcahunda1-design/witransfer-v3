"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { FilterSidebar, CarResults } from "@/components";
import { BackToTop } from "@/components/ui/back-to-top";
import { SearchFilters, SearchResponse, Supplier, Category, SystemData } from "@/types";
import { Loader2 } from "lucide-react";

export function SearchPageContent({
  defaultType,
  initialSearchData,
  initialResults,
  initialSystemData,
}: {
  defaultType?: "rental" | "transfer";
  initialSearchData?: SearchFilters;
  initialResults?: SearchResponse | null;
  initialSystemData?: SystemData | null;
}) {
  const [isLoading, setIsLoading] = useState(
    !initialSearchData && !initialResults,
  );
  const [facets, setFacets] = useState<Record<string, Record<string, number>>>(
    initialResults?.facets || {},
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(
    initialResults?.suppliers || [],
  );

  // Se tiver dados iniciais do servidor, usa direto
  const [searchData, setSearchData] = useState<SearchFilters>(initialSearchData || {});
  const [categoriesData, setCategoriesData] = useState<Category[]>(
    initialSystemData?.categories || [],
  );
  const [extrasData, setExtrasData] = useState<any[]>(
    initialSystemData?.extras || [],
  );

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    async function init() {
      try {
        // Carregar dados do sistema (categorias, extras, etc) se não vieram do servidor
        if (!initialSystemData) {
          const { getSystemData } = await import("@/actions/public/search/cars");
          try {
            const systemData = await getSystemData();
            if (systemData?.categories) setCategoriesData(systemData.categories);
            if (systemData?.extras) setExtrasData(systemData.extras);
          } catch (e) {
            console.warn("[Search] Falha ao carregar dados de sistema:", e);
            // Continua com dados vazios, componentes devem lidar com isso
          }
        }

      // Se já temos initialSearchData, talvez só precisemos atualizar se a URL mudar depois
      // Mas para o primeiro load, initialSearchData é suficiente.
      // Contudo, se s mudar via navegação client-side, precisamos ouvir searchParams.

      let data: SearchFilters = initialSearchData || {};

      // If compressed state present in `s` param, prefer it (client navigation)
      const s = searchParams.get("s");
      // Só decodifica se não tivermos data (ou se s mudou - difícil checar aqui sem ref)
      // Lógica simplificada: Se temos initialSearchData e é o primeiro render, ok.
      // Se searchParams mudou, re-decodifica.

      if (s && (!initialSearchData || searchParams.toString() !== "")) {
        try {
          const { decodeState } = await import("@/lib/url-state");
          const decoded = decodeState(s);
          if (decoded) data = decoded;
        } catch (e) {
          console.error("Failed to decode state from URL:", e);
        }
      }

      // ... resto da lógica de fallback sid e legacy ...
      if (!data || Object.keys(data).length === 0) {
        // ... fallback logic ...
        const did = searchParams.get("did");
        const sid = searchParams.get("sid");
        const fallbackId = did || sid;

        if (fallbackId) {
          try {
            const stored = sessionStorage.getItem(fallbackId);
            if (stored) {
              const parsed = JSON.parse(stored);
              // Draft could be { search: ... } or just the filters
              data = parsed.search || parsed;
              console.log("✅ [CONTENT] Loaded filters from sessionStorage:", fallbackId);
            }
          } catch (e) {
            console.warn("Failed to load draft from sessionStorage:", e);
          }
        }

        // legacy params directly from URL
        if (!data || Object.keys(data).length === 0) {
          searchParams.forEach((val, key) => {
            (data as any)[key] = val;
          });
        }

        // FINAL FALLBACK: check for last search in sessionStorage (essential for "Back" button)
        if (!data || Object.keys(data).length === 0 || !data.pickup) {
          try {
            const lastSearch = sessionStorage.getItem("witransfer_last_search");
            if (lastSearch) {
              data = JSON.parse(lastSearch);
              console.log("✅ [CONTENT] Recovered state from witransfer_last_search");
            }
          } catch (e) {
            console.warn("Failed to recover last search:", e);
          }
        }
      }

        // Ensure type
        if (!data.type) {
          if (defaultType) data.type = defaultType;
          else if (pathname.includes("/transfer")) data.type = "transfer";
          else if (pathname.includes("/rental")) data.type = "rental";
        }

        setSearchData(data);
      } catch (err) {
        console.error("[Search] Erro crítico na inicialização:", err);
        // Mesmo com erro, define dados padrão para evitar carregar infinito
        setSearchData({
          type: defaultType || "rental"
        } as SearchFilters);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [searchParams, pathname, router, defaultType]);

  return (
    <>
      <div className="flex-grow relative">
        <main className="flex-grow relative">
          <div className="w-full py-8 px-0 md:px-6">
            <div className="max-w-[1400px] mx-auto">
              <div className="flex flex-col-reverse lg:flex-row gap-6 lg:gap-8">
                <div className="flex-1 min-w-0">
                  {isLoading ? (
                    <div className="w-full flex flex-col items-center justify-center py-24 text-slate-400 gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      <p className="font-bold tracking-[0.2em] text-xs">Sincronizando Pesquisa...</p>
                    </div>
                  ) : (
                    <CarResults
                      searchData={searchData}
                      initialResults={initialResults}
                      facets={facets}
                      suppliers={suppliers}
                      categoriesData={categoriesData}
                      extrasData={extrasData}
                      onDataChange={(data) => {
                        setFacets(data.facets);
                        setSuppliers(data.suppliers);
                      }}
                    />
                  )}
                </div>
                <div className="w-full lg:w-auto lg:flex-shrink-0">
                  <FilterSidebar
                    facets={facets}
                    suppliers={suppliers}
                    categoriesData={categoriesData}
                    extrasData={extrasData}
                  />
                </div>
              </div>
            </div>
          </div>
        </main>
        <BackToTop />
      </div>
    </>
  );
}
