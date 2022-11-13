import { Token } from '../constants/token';
import { NetworkType } from '../core/types/network';
import { useWallet } from './useWallet';
import { CoinSymbol, useCoinBalance } from './useCoinBalance';

export function useAccountBalance() {
  const { account } = useWallet();
  const { error, loading, balance } = useCoinBalance({
    address: account?.address ?? '',
    symbol: CoinSymbol.SUI,
    opts: {
      networkId: NetworkType.devnet,
    },
  });
  return {
    balance,
    error,
    loading,
  };
}
