import { useMutation } from "@tanstack/react-query";
import { analyseText } from "@/api/match.api";

export function useAnalyseText() {
  return useMutation({
    mutationFn: (text: string) => analyseText(text),
  });
}
