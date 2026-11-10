import { useCallback, useEffect, useRef, useState } from 'react';
import type { WithPk } from '../../server/pulse-types.js';
import type { QueryDescriptor } from '../../types.js';
import { PulseQuery, type PulseQueryState } from '../pulse-query.js';

function getDescriptorKey(descriptor: QueryDescriptor<unknown>) {
  return JSON.stringify({
    queryName: descriptor.queryName,
    args: descriptor.args,
    url: descriptor.url,
  });
}

export interface UsePulseQueryResult<TData> {
  data: readonly TData[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  loadMore: () => void;
  refetch: () => void;
}

export function usePulseQuery<TResult extends WithPk<Record<string, unknown>>>(
  descriptor: QueryDescriptor<TResult>,
): UsePulseQueryResult<TResult> {
  const [state, setState] = useState<PulseQueryState<TResult>>({
    data: [],
    isLoading: true,
    isLoadingMore: false,
    hasMore: false,
    error: null,
  });
  const queryRef = useRef<PulseQuery<TResult> | null>(null);
  const descriptorRef = useRef(descriptor);
  const descriptorKey = getDescriptorKey(descriptor);

  descriptorRef.current = descriptor;

  const beginRefetch = useCallback(() => {
    setState((currentState) => ({
      ...currentState,
      isLoading: true,
      isLoadingMore: false,
      error: null,
    }));
  }, []);

  const loadMore = useCallback(() => {
    if (!queryRef.current) return;
    void queryRef.current.loadMore();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies(descriptorKey): a new descriptor identity must produce a new callback so the effect below destroys and re-creates the subscription
  const initializeSubscription = useCallback(() => {
    const query = new PulseQuery<TResult>(descriptorRef.current, {
      onStateChange: (nextState) => {
        setState(nextState);
      },
    });
    queryRef.current = query;
    void query.subscribe();
  }, [descriptorKey]);

  useEffect(() => {
    initializeSubscription();

    return () => {
      queryRef.current?.destroy();
      queryRef.current = null;
    };
  }, [initializeSubscription]);

  const refetch = useCallback(() => {
    queryRef.current?.destroy();
    beginRefetch();
    initializeSubscription();
  }, [beginRefetch, initializeSubscription]);

  return { ...state, loadMore, refetch };
}
