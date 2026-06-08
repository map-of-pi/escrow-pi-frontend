"use client";

import 'react-toastify/dist/ReactToastify.css';
import {
  createContext,
  useState,
  SetStateAction,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { usePathname } from 'next/navigation';
import axiosClient, { setAuthToken } from '@/config/client';
import { onIncompletePaymentFound } from '@/config/payment';
import { AuthResult, InitParams, PiType } from '@/config/pi';
import { IUser } from '@/types';

interface IAppContextProps {
  currentUser: IUser | null;
  setCurrentUser: React.Dispatch<SetStateAction<IUser | null>>;
  registerUser: () => void;
  autoLoginUser: () => void;
  isSigningInUser: boolean;
  reload: boolean;
  alertMessage: string | null;
  setAlertMessage: React.Dispatch<SetStateAction<string | null>>;
  showAlert: (message: string) => void;
  setReload: React.Dispatch<SetStateAction<boolean>>;
  isSaveLoading: boolean;
  setIsSaveLoading: React.Dispatch<SetStateAction<boolean>>;
  adsSupported: boolean;
  piAccessToken: string | null;
  setPiAccessToken: (token: string | null) => void;
  authenticateWithPi: (overrideInit?: InitParams) => Promise<AuthResult>;
}

const initialState: IAppContextProps = {
  currentUser: null,
  setCurrentUser: () => {},
  registerUser: () => {},
  autoLoginUser: () => {},
  isSigningInUser: false,
  reload: false,
  alertMessage: null,
  setAlertMessage: () => {},
  showAlert: () => {},
  setReload: () => {},
  isSaveLoading: false,
  setIsSaveLoading: () => {},
  adsSupported: false,
  piAccessToken: null,
  setPiAccessToken: () => {},
  authenticateWithPi: async () => {
    throw new Error('authenticateWithPi not initialized');
  },
};

export const AppContext = createContext<IAppContextProps>(initialState);

interface AppContextProviderProps {
  children: ReactNode;
}

const PI_SDK_SCRIPT_ID = 'escrowpi-shared-pi-sdk';
let piSdkLoadingPromise: Promise<PiType> | null = null;

const loadPiSdk = (): Promise<PiType> => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Pi SDK is only available inside Pi Browser.'));
  }

  if (window.Pi) {
    return Promise.resolve(window.Pi);
  }

  if (piSdkLoadingPromise) {
    return piSdkLoadingPromise;
  }

  piSdkLoadingPromise = new Promise((resolve, reject) => {
    let script = document.getElementById(PI_SDK_SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = PI_SDK_SCRIPT_ID;
      script.src = 'https://sdk.minepi.com/pi-sdk.js';
      script.async = true;
      document.head.appendChild(script);
    }

    const cleanup = () => {
      script?.removeEventListener('load', handleLoad);
      script?.removeEventListener('error', handleError);
      piSdkLoadingPromise = null;
    };

    const handleLoad = () => {
      cleanup();
      if (window.Pi) {
        resolve(window.Pi);
      } else {
        reject(new Error('Pi SDK failed to attach to window.'));
      }
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Failed to load Pi SDK script.'));
    };

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
  });

  return piSdkLoadingPromise;
};

const AppContextProvider = ({ children }: AppContextProviderProps) => {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<IUser | null>(null);
  const [isSigningInUser, setIsSigningInUser] = useState(false);
  const [reload, setReload] = useState(false);
  const [isSaveLoading, setIsSaveLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [adsSupported, setAdsSupported] = useState(false);
  const [piAccessTokenState, setPiAccessTokenState] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return sessionStorage.getItem('escrowPiAccessToken');
  });

  const setPiAccessToken = useCallback((token: string | null) => {
    setPiAccessTokenState(token);
    if (typeof window === 'undefined') {
      return;
    }
    if (token) {
      sessionStorage.setItem('escrowPiAccessToken', token);
    } else {
      sessionStorage.removeItem('escrowPiAccessToken');
    }
  }, []);

  const showAlert = (message: string) => {
    setAlertMessage(message);
    setTimeout(() => {
      setAlertMessage(null); // Clear alert after 5 seconds
    }, 5000);
  };

  const defaultPiInitConfig = useMemo<InitParams>(() => ({
    version: '2.0',
    sandbox: process.env.NODE_ENV !== 'production',
  }), []);

  const lastPiInitConfigRef = useRef<InitParams | null>(null);

  const initConfigsMatch = useCallback((a: InitParams | null, b: InitParams | null) => {
    if (!a || !b) {
      return false;
    }
    const aSandbox = typeof a.sandbox === 'boolean' ? a.sandbox : false;
    const bSandbox = typeof b.sandbox === 'boolean' ? b.sandbox : false;
    return a.version === b.version && aSandbox === bSandbox;
  }, []);

  const ensurePiSdkInitialized = useCallback(async (overrideInit?: InitParams) => {
    const Pi = await loadPiSdk();
    const desiredConfig = overrideInit ?? defaultPiInitConfig;
    const shouldInit =
      !Pi.initialized ||
      !initConfigsMatch(lastPiInitConfigRef.current, desiredConfig);

    if (shouldInit) {
      await Promise.resolve(Pi.init(desiredConfig) as unknown);
      lastPiInitConfigRef.current = desiredConfig;
    }
    return Pi;
  }, [defaultPiInitConfig, initConfigsMatch]);

  const authenticateWithPi = useCallback(async (overrideInit?: InitParams): Promise<AuthResult> => {
    const Pi = await ensurePiSdkInitialized(overrideInit);
    const pioneerAuth = await Pi.authenticate(
      ['username', 'payments', 'wallet_address'],
      onIncompletePaymentFound
    );
    if (!pioneerAuth?.accessToken) {
      throw new Error('Unable to acquire Pi access token.');
    }
    setPiAccessToken(pioneerAuth.accessToken);
    return pioneerAuth;
  }, [ensurePiSdkInitialized, setPiAccessToken]);

  /* Register User via Pi SDK */
  const registerUser = async () => {

    // logger.info('Starting user registration.');
    if (isSigningInUser || currentUser) return

    try {
      setIsSigningInUser(true);
      const pioneerAuth = await authenticateWithPi();

      // Send accessToken to backend
      const res = await axiosClient.post(
        "/users/authenticate", 
        {}, // empty body
        {
          headers: {
            Authorization: `Bearer ${pioneerAuth.accessToken}`,
          },
        }
      );

      if (res.status === 200) {
        setAuthToken(res.data?.token);
        setCurrentUser(res.data.user);
        // logger.info('User authenticated successfully.');
      } else {
        setCurrentUser(null);
        // logger.error('User authentication failed.');
      }
    } catch (error) {
      // logger.error('Error during user registration:', error);
      console.error('>>> [registerUser] Error during user registration:', error);
    } finally {
      setTimeout(() => setIsSigningInUser(false), 2500);
    }
  };

  /* Attempt Auto Login (fallback to Pi auth) */
  const autoLoginUser = async () => {

    // logger.info('Attempting to auto-login user.');
    try {
      setIsSigningInUser(true);

      const res = await axiosClient.get('/users/me');

      if (res.status === 200) {
        // logger.info('Auto-login successful.');
        setCurrentUser(res.data.user);
      } else {
        setCurrentUser(null);
        // logger.warn('Auto-login failed.');
      }
    } catch (error) {
      await registerUser();

    } finally {
      setTimeout(() => setIsSigningInUser(false), 2500);
    }
  };

  useEffect(() => {
    if (isSigningInUser || currentUser) return;

    const isProviderCheckoutRoute =
      pathname?.startsWith('/provider/pay') || pathname?.startsWith('/provider/callback');
    if (isProviderCheckoutRoute) {
      return;
    }

    // attempt to load and initialize Pi SDK in parallel
    ensurePiSdkInitialized()
      .then(Pi => Pi.nativeFeaturesList())
      .then(features => {
        setAdsSupported(features.includes("ad_network"));
      })
      .catch(err => console.error('>>> [ensurePiSdkInitialized] Pi SDK load/init error:', err));

    autoLoginUser();
  }, [isSigningInUser, pathname, currentUser, ensurePiSdkInitialized]);

  return (
    <AppContext.Provider 
      value={{ 
        currentUser, 
        setCurrentUser, 
        registerUser, 
        autoLoginUser, 
        isSigningInUser, 
        reload, 
        setReload, 
        showAlert, 
        alertMessage, 
        setAlertMessage, 
        isSaveLoading, 
        setIsSaveLoading, 
        adsSupported,
        piAccessToken: piAccessTokenState,
        setPiAccessToken,
        authenticateWithPi
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export default AppContextProvider;