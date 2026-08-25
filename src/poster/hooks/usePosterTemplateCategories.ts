import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PosterTemplateCategoryDefinition } from '../../../shared/poster/templateCategory';
import { fetchPosterTemplateCategories } from '../services/posterTemplateCategoriesApi';
import { mergePosterTemplateCategoryDefinitions } from '../templateTypes';

export function usePosterTemplateCategories() {
  const [customCategories, setCustomCategories] = useState<PosterTemplateCategoryDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCustomCategories(await fetchPosterTemplateCategories());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Poster categories could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const categories = useMemo(
    () => mergePosterTemplateCategoryDefinitions(customCategories),
    [customCategories],
  );

  return { categories, customCategories, loading, error, refresh };
}
