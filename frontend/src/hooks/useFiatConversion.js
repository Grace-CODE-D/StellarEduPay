'use client';
import { useState, useEffect } from 'react';
import { getConversionRates } from '../services/api';

/**
 * Fetches the XLM/USD conversion rate and returns the fiat equivalent of
 * `xlmAmount`. Clears the stale result immediately when `xlmAmount` changes
 * so callers never display an old conversion for a new amount.
 *
 * @param {number|null} xlmAmount - XLM amount to convert (null/undefined = idle)
 * @returns {{ fiatAmount: number|null, currency: string, rate: number|null, loading: boolean, error: string|null }}
 */
export function useFiatConversion(xlmAmount) {
  const [fiatAmount, setFiatAmount] = useState(null);
  const [rate, setRate]             = useState(null);
  const [currency, setCurrency]     = useState('USD');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  useEffect(() => {
    // Clear stale value immediately so callers never show old data for new amount
    setFiatAmount(null);
    setRate(null);
    setError(null);

    if (xlmAmount == null || xlmAmount <= 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getConversionRates()
      .then(({ data }) => {
        if (cancelled) return;
        const fetchedRate = data?.rates?.USD ?? data?.USD ?? null;
        if (fetchedRate == null) throw new Error('Rate unavailable');
        setRate(fetchedRate);
        setCurrency('USD');
        setFiatAmount(parseFloat((xlmAmount * fetchedRate).toFixed(2)));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to fetch conversion rate');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [xlmAmount]);

  return { fiatAmount, currency, rate, loading, error };
}
