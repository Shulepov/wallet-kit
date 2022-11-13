import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { network } from '../core/network';
import { Provider } from '../core/provider';
import { Network, NetworkType } from '../core/types/network';
import { swrLoading } from '../utils/others';
import { NftObject } from '../core/types/object';

type GetOwnedObjParams = { network: Network; address: string };

async function getOwnedNfts(
  params: GetOwnedObjParams
): Promise<Array<NftObject>> {
  const { network, address } = params;
  const provider = new Provider(network.queryRpcUrl, network.gatewayRpcUrl);
  const nfts = await provider.query.getOwnedNfts(address);
  return Array.from(nfts);
}

export function useOwnedNfts({
  address,
  opts = {
    canFetch: true,
  },
}: {
  address: string;
  opts: {
    networkId?: string;
  };
}) {
  const [ownedNfts, setOwnedNfts] = useState<string>('0');
  const { networkId = 'devnet' } = opts;
  const net = network.getNetwork(NetworkType.devnet);
  const {
    data: ownedNftsArr,
    error,
    isValidating,
  } = useSWR(
    [`b?network=${networkId}`, address, network],
    fetchOwnedObjects
  );

  async function fetchOwnedObjects(
    _: string,
    address: string,
    network: Network 
  ) {
    var arr = new Array<NftObject>();
    if (!address || !network) return arr;

    arr = await getOwnedNfts({ address, network: net });
    if (!arr) {
      throw new Error(`fetch ownedObjects failed: ${address}, ${networkId}`);
    }

    return arr;
  }

  useEffect(() => {
    if (!ownedNftsArr) return;
    setOwnedNfts(ownedNftsArr);
  }, [ownedNftsArr]);

  return {
    ownedNfts,
    error,
    isValidating,
    loading: swrLoading(ownedNftsArr, error),
  };
}
