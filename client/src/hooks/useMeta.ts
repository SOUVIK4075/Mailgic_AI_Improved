import { useEffect, useState } from 'react';
import { api, getErrorMessage } from '../lib/api';
import type { Meta } from '../types';

// Module-level cache: /api/meta never changes while the app is open,
// so every component shares one request and one result.
let cachedMeta: Meta | null = null;
let metaPromise: Promise<Meta> | null = null;

export function useMeta() {
  const [meta, setMeta] = useState<Meta | null>(cachedMeta);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cachedMeta) return;
    let active = true;

    if (!metaPromise) metaPromise = api<Meta>('/meta');
    metaPromise
      .then((data) => {
        cachedMeta = data;
        if (active) setMeta(data);
      })
      .catch((err) => {
        metaPromise = null; // let the next mount try again
        if (active) setError(getErrorMessage(err));
      });

    return () => {
      active = false;
    };
  }, []);

  return { meta, error };
}
