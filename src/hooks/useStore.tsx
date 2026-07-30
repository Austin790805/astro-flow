// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import RootStore from '@/stores/root-store';
import { TWebSocket } from '@/Types';
import Bot from '../external/bot-skeleton/scratch/dbot';

const StoreContext = createContext<null | RootStore>(null);

// Global reference to the root store, used by the bot interpreter to access
// execution speed settings without React context.
let _rootStore: RootStore | null = null;
export const setRootStore = (store: RootStore | null) => {
    _rootStore = store;
};
export const getRootStore = () => _rootStore;

type TStoreProvider = {
    children: React.ReactNode;
    mockStore?: RootStore;
};

const StoreProvider: React.FC<TStoreProvider> = ({ children, mockStore }) => {
    const [store, setStore] = useState<RootStore | null>(null);
    const initializingStore = useRef(false);

    useEffect(() => {
        const initializeStore = async () => {
            const rootStore = new RootStore(Bot);
            setStore(rootStore);
        };

        if (!store && !initializingStore.current) {
            initializingStore.current = true;
            // If the store is mocked for testing purposes, then return the mocked value.
            if (mockStore) {
                setStore(mockStore);
            } else {
                initializeStore();
            }
        }
    }, [store, mockStore]);

    if (!store && mockStore) return null;

    // Keep the global reference in sync for the bot interpreter
    _rootStore = store;
    return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
};

const useStore = () => {
    const store = useContext(StoreContext);

    return store as RootStore;
};

export { StoreProvider, useStore };

export const mockStore = (ws: TWebSocket) => new RootStore(Bot, ws);
