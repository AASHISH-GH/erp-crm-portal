import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from './api';
import type { PaginationMeta } from './types';

const EMPTY_META: PaginationMeta = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPrevPage: false,
};

/**
 * Shared fetch-list-with-filters behaviour for every index page.
 *
 * Filter changes are debounced (so typing in a search box does not fire a request per
 * keystroke) and each response is stamped with a request id, so a slow earlier response
 * can never overwrite a newer one.
 */
export const useList = <T>(endpoint: string, params: Record<string, unknown>, debounceMs = 300) => {
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const requestId = useRef(0);
  const serialisedParams = JSON.stringify(params);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setLoading(true);

    const timer = setTimeout(() => {
      const query = Object.fromEntries(
        Object.entries(JSON.parse(serialisedParams) as Record<string, unknown>).filter(
          ([, value]) => value !== '' && value !== undefined && value !== null,
        ),
      );

      api
        .get(endpoint, { params: query })
        .then(({ data }) => {
          if (currentRequest !== requestId.current) return; // a newer request superseded this one
          setItems(data.data);
          setMeta(data.meta ?? EMPTY_META);
          setError(null);
        })
        .catch((err) => {
          if (currentRequest !== requestId.current) return;
          setError(getErrorMessage(err));
        })
        .finally(() => {
          if (currentRequest === requestId.current) setLoading(false);
        });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [endpoint, serialisedParams, debounceMs, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { items, meta, loading, error, reload };
};
