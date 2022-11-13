import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { network } from '../core/network';
import { Provider } from '../core/provider';
import { Network, NetworkType } from '../core/types/network';
import { swrLoading } from '../utils/others';
import { SuiObject } from '@mysten/sui.js'

type GetOwnedObjParams = { network: Network; address: string };

async function getOwnedObjects(
  params: GetOwnedObjParams
): Promise<Array<SuiObject>> {
  const { network, address } = params;
  const provider = new Provider(network.queryRpcUrl, network.gatewayRpcUrl);
  const objects = await provider.query.getOwnedObjects(address);
  return Array.from(objects);
}

export function useOwnedObjects({
  address,
  opts = {},
}: {
  address: string;
  opts: {
    networkId?: string;
  };
}) {
  const [ownedObjects, setOwnedObjects] = useState<string>('0');
  const { networkId = 'devnet'} = opts;
  const net = network.getNetwork(NetworkType.devnet);
  const {
    data: ownedObjectsArr,
    error,
    isValidating,
  } = useSWR(
    ['c?network=${networkId}', address, network],
    fetchOwnedObjects
  );

  async function fetchOwnedObjects(
    _: string,
    address: string,
    network: Network
  ) {
    var arr = new Array<SuiObject>();
    if (!address || !network) return arr;

    arr = await getOwnedObjects({ address, network: net });
    if (!arr) {
      throw new Error(`fetch ownedObjects failed: ${address}, ${networkId}`);
    }

    return arr;
  }

  useEffect(() => {
    if (!ownedObjectsArr) return;
    setOwnedObjects(ownedObjectsArr);
  }, [ownedObjectsArr]);

  return {
    ownedObjects,
    error,
    isValidating,
    loading: swrLoading(ownedObjectsArr, error),
  };
}
