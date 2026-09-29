import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Land } from '@/api/types';

export function useLand(id: string | undefined) {
  return useQuery({
    queryKey: ['land', id],
    queryFn: async () => (await api.get<{ land: Land }>(`/lands/${id}`)).data.land,
    enabled: Boolean(id),
  });
}
