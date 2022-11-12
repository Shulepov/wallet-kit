import { Token } from '../constants/token';
import { NetworkType } from '../core/types/network';
import { useWallet } from './useWallet';
import { CoinSymbol, useCoinBalance } from './useCoinBalance';

export function useAccountBalance(token = Token.SUI) {
  const { address, connected } = useWallet();
  const { error, loading, getBalance } = useCoinBalance({
    address,
    opts: {
      networkId: NetworkType.devnet,
      canFetch: connected,
    },
  });

  if (token === Token.SUI) {
    const balance = getBalance(CoinSymbol.SUI);
    return { error, loading, balance };
  }

  return { error: new Error('Unexpected Token'), loading: false, balance: '0' };
}
