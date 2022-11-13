import React, {useCallback, useEffect, useMemo, useState} from "react";
import {WalletContext} from "../hooks/useWallet";
import {
  ConnectionStatus,
  IWalletAdapter,
  IDefaultWallet, IWallet,
} from "../types/wallet";
import {
  ConnectInput,
  SuiSignAndExecuteTransactionInput,
  WalletAccount,
} from "@mysten/wallet-standard";
import {KitError} from "../errors";
import {AllDefaultWallets} from "../wallet/default-wallets";
import {useWalletAdapterDetection} from "../wallet-standard/use-wallet-detection";
import {Extendable} from "../types";
import {isNonEmptyArray} from "../utils";
import {MoveCallTransaction} from "@mysten/sui.js";
import {FeatureName} from "../wallet/wallet-adapter";
import {deprecatedWarn} from "../legacy/tips";

export type WalletProviderProps = Extendable & {
  defaultWallets?: IDefaultWallet[];
  /**
   * @deprecated use defaultWallets to customize wallet list
   */
  supportedWallets?: any[];
};

const useAvailableWallets = (defaultWallets: IDefaultWallet[]) => {
  const {data: availableWalletAdapters} = useWalletAdapterDetection()
  // configured wallets
  const configuredWallets = useMemo(() => {
    if (!isNonEmptyArray(defaultWallets)) return [];
    if (!isNonEmptyArray(availableWalletAdapters)) {
      return defaultWallets.map(item => ({
        ...item,
        adapter: undefined,
        installed: false,
      }) as IWallet)
    }

    return defaultWallets.map((item) => {
      const foundAdapter = availableWalletAdapters.find(walletAdapter => item.name === walletAdapter.name);
      if (foundAdapter) {
        return {
          ...item,
          adapter: foundAdapter,
          installed: true,
        } as IWallet
      }
      return {
        ...item,
        adapter: undefined,
        installed: false,
      } as IWallet
    });
  }, [defaultWallets, availableWalletAdapters])

  // detected wallets
  const detectedWallets = useMemo(() => {
    if (!isNonEmptyArray(availableWalletAdapters)) return [];
    return availableWalletAdapters.filter(adapter => {
      // filter adapters not shown in the configured list
      return !defaultWallets.find(wallet => wallet.name === adapter.name)
    }).map((adapter) => {
      // normalized detected adapter to IWallet
      return {
        name: adapter.name,
        adapter: adapter,
        installed: true,
        iconUrl: adapter.icon,
        downloadUrl: {
          browserExtension: '',  // no need to know
        },
      }
    })
  }, [defaultWallets, availableWalletAdapters]);

  // filter installed wallets
  const allAvailableWallets = useMemo(() => {
    return [
      ...configuredWallets,
      ...detectedWallets,
    ].filter(wallet => wallet.installed)
  }, [configuredWallets, detectedWallets])

  return {
    allAvailableWallets,
    configuredWallets,
    detectedWallets,
  };
};

export const WalletProvider = (props: WalletProviderProps) => {
  const {defaultWallets = AllDefaultWallets, children} = props;
  const {
    allAvailableWallets,
    configuredWallets,
    detectedWallets
  } = useAvailableWallets(defaultWallets);

  const [walletAdapter, setWalletAdapter] = useState<IWalletAdapter | undefined>();
  const [status, setStatus] = useState<ConnectionStatus>(
    ConnectionStatus.DISCONNECTED
  );

  const isCallable = (
    walletAdapter: IWalletAdapter | undefined,
    status: ConnectionStatus
  ) => {
    return walletAdapter && status === ConnectionStatus.CONNECTED;
  };

  const account = useMemo<WalletAccount | undefined>(() => {
    if (!isCallable(walletAdapter, status)) return;
    return (walletAdapter as IWalletAdapter).accounts[0]; // use first account by default
  }, [walletAdapter, status]);

  const ensureCallable = (
    walletAdapter: IWalletAdapter | undefined,
    status: ConnectionStatus
  ) => {
    if (!isCallable(walletAdapter, status)) {
      throw new KitError("Failed to call function, wallet not connected");
    }
  };

  const connect = useCallback(
    async (adapter: IWalletAdapter, opts?: ConnectInput) => {
      if (!adapter) throw new KitError("param adapter is missing");

      setStatus(ConnectionStatus.CONNECTING);
      try {
        const res = await adapter.connect(opts);
        setWalletAdapter(adapter);
        setStatus(ConnectionStatus.CONNECTED);
        return res;
      } catch (e) {
        setWalletAdapter(undefined);
        setStatus(ConnectionStatus.DISCONNECTED);
        throw e;
      }
    },
    []
  );

  const disconnect = useCallback(async () => {
    ensureCallable(walletAdapter, status);
    const adapter = walletAdapter as IWalletAdapter;
    try {
      // disconnect is an optional action for wallet
      if (adapter.hasFeature(FeatureName.STANDARD__DISCONNECT)) {
        await adapter.disconnect();
      }
    } finally {
      setWalletAdapter(undefined);
      setStatus(ConnectionStatus.DISCONNECTED);
    }
  }, [walletAdapter, status]);

  const select = useCallback(async (walletName: string) => {
    // disconnect previous connection if it exists
    if (isCallable(walletAdapter, status)) {
      const adapter = walletAdapter as IWalletAdapter;
      // Same wallet, ignore
      if (walletName === adapter.name) return;

      // else first disconnect current wallet
      await disconnect()
    }

    const wallet = allAvailableWallets.find((wallet) => wallet.name === walletName);
    if (!wallet) {
      const availableWalletNames = allAvailableWallets.map(wallet => wallet.name)
      throw new KitError(`select failed: wallet ${walletName} is not available, all wallets are listed here: [${availableWalletNames.join(', ')}]`)
    }
    await connect(wallet.adapter as IWalletAdapter)
  }, [walletAdapter, status, allAvailableWallets])

  const getAccounts = useCallback(() => {
    ensureCallable(walletAdapter, status);
    const _wallet = walletAdapter as IWalletAdapter;
    return _wallet.accounts;
  }, [walletAdapter, status]);

  const signAndExecuteTransaction = useCallback(
    async (transaction: SuiSignAndExecuteTransactionInput) => {
      ensureCallable(walletAdapter, status);
      const _wallet = walletAdapter as IWalletAdapter;
      return await _wallet.signAndExecuteTransaction(transaction);
    },
    [walletAdapter, status]
  );

  const signMessage = useCallback(
    async (input: {message: Uint8Array}) => {
      ensureCallable(walletAdapter, status);
      if (!account) {
        throw new KitError("no active account");
      }

      const adapter = walletAdapter as IWalletAdapter;
      return await adapter.signMessage({
        account,
        message: input.message,
      });
    },
    [walletAdapter, account, status]
  );

  const executeMoveCall = useCallback((data: MoveCallTransaction) => {
    ensureCallable(walletAdapter, status);
    return signAndExecuteTransaction({
      transaction: {
        kind: 'moveCall',
        data: data
      }
    });
  }, [signAndExecuteTransaction, walletAdapter, status])

  const getPublicKey = useCallback(() => {
    ensureCallable(walletAdapter, status);
    return Promise.resolve((account as WalletAccount).publicKey);
  }, [walletAdapter, account, status])

  useEffect(() => {
    if (props.supportedWallets) {
      deprecatedWarn({
        name: 'supportedWallets',
        message: 'use defaultWallets to customize wallet list',
        migrationDoc: 'https://kit.suiet.app/docs/migration/upgradeTo0.1.0'
      })
    }
  }, [])

  return (
    <WalletContext.Provider
      value={{
        allAvailableWallets,
        configuredWallets,
        detectedWallets,
        wallet: walletAdapter,
        status,
        connecting: status === ConnectionStatus.CONNECTING,
        connected: status === ConnectionStatus.CONNECTED,
        select,
        disconnect,
        getAccounts,
        account,
        signAndExecuteTransaction,
        signMessage,
        address: account?.address,
        supportedWallets: props.supportedWallets ?? [],
        executeMoveCall,
        getPublicKey,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};