import { useQuery } from "@tanstack/react-query";
import { getCategories } from "@/api/categories.api";
import { queryKeys } from "@/lib/query-keys";

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: getCategories,
    staleTime: Infinity,
  });
}
