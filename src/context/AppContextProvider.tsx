"use client";

import 'react-toastify/dist/ReactToastify.css';
import {
  createContext,
  useState,
  SetStateAction,
  ReactNode,
  useEffect
} from 'react';
import axiosClient, { setAuthToken } from '@/config/client';
import { onIncompletePaymentFound } from '@/config/payment';
import { AuthResult } from '@/config/pi';
import { IUser } from '@/types';
import { toast } from 'react-toastify';

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
  adsSupported: false
};

export const AppContext = createContext<IAppContextProps>(initialState);

interface AppContextProviderProps {
  children: ReactNode;
}

const AppContextProvider = ({ children }: AppContextProviderProps) => {
  const [currentUser, setCurrentUser] = useState<IUser | null>(null);
  const [isSigningInUser, setIsSigningInUser] = useState(false);
  const [reload, setReload] = useState(false);
  const [isSaveLoading, setIsSaveLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [adsSupported, setAdsSupported] = useState(false);

  const showAlert = (message: string) => {
    setAlertMessage(message);
    setTimeout(() => {
      setAlertMessage(null); // Clear alert after 5 seconds
    }, 5000);
  };

  /* Register User via Pi SDK */
  const registerUser = async () => {
    // logger.info('Starting user registration.');
    if (isSigningInUser || currentUser) return

    if (typeof window !== 'undefined' && window.Pi?.initialized) {
      try {
        setIsSigningInUser(true);
        console.log('>>> [registerUser] Starting Pi authentication...');
        const pioneerAuth: AuthResult = await window.Pi.authenticate([
          'username', 
          'payments', 
          'wallet_address'
        ], onIncompletePaymentFound);

        console.log('>>> [registerUser] Pioneer authentication successful:', pioneerAuth);
        console.log('>>> [registerUser] accessToken from Pi SDK:', pioneerAuth.accessToken);

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

        console.log('>>> [registerUser] Backend response:', res.data);

        if (res.status === 200) {
          setAuthToken(res.data?.token);
          console.log('>>> [registerUser] Axios headers after setAuthToken:', axiosClient.defaults.headers.common);
          setCurrentUser(res.data.user);
          // logger.info('User authenticated successfully.');
        } else {
          setCurrentUser(null);
          console.warn('>>> [registerUser] User authentication failed.');
          // logger.error('User authentication failed.');
        }
      } catch (error) {
        // logger.error('Error during user registration:', error);
        console.error('>>> [registerUser] Error during user registration:', error);
        toast.error('Error during user registration.');
      } finally {
        setTimeout(() => setIsSigningInUser(false), 2500);
      }
    } else {
      // logger.error('PI SDK failed to initialize.');
      console.error('>>> [registerUser] PI SDK failed to initialize.');
      toast.error('PI SDK failed to initialize.');
    }
  };

  /* Attempt Auto Login (fallback to Pi auth) */
  const autoLoginUser = async () => {
    // logger.info('Attempting to auto-login user.');
    try {
      setIsSigningInUser(true);
      console.log('>>> [autoLoginUser] Attempting /users/me request...');
      console.log('>>> [autoLoginUser] Axios headers before /users/me:', axiosClient.defaults.headers.common);

      const res = await axiosClient.get('/users/me');

      if (res.status === 200) {
        console.log('>>> [autoLoginUser] Auto-login successful:', res.data.user);
        // logger.info('Auto-login successful.');
        setCurrentUser(res.data.user);
      } else {
        console.warn('>>> [autoLoginUser] Auto-login failed.');
        // logger.warn('Auto-login failed.');
        setCurrentUser(null);
      }
    } catch (error) {
      console.warn('>>> [autoLoginUser] Auto-login failed, falling back to Pi authentication:', error);
      // logger.error('Auto login unresolved; attempting Pi SDK authentication:', error);
      await registerUser();
    } finally {
      setTimeout(() => setIsSigningInUser(false), 2500);
    }
  };

  const loadPiSdk = (): Promise<typeof window.Pi> => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://sdk.minepi.com/pi-sdk.js';
      script.async = true;
      script.onload = () => {
        console.log('>>> [loadPiSdk] Pi SDK script loaded.');
        resolve(window.Pi);
      };
      script.onerror = () => {
        console.error('>>> [loadPiSdk] Failed to load Pi SDK script.');
        reject(new Error('Failed to load Pi SDK'));
      };
      document.head.appendChild(script);
    });
  };

  useEffect(() => {
    // logger.info('AppContextProvider mounted.');
    if (isSigningInUser || currentUser) return
    autoLoginUser();

    const nodeEnv = process.env.NODE_ENV as 'development' | 'staging';

    // attempt to load and initialize Pi SDK in parallel
    loadPiSdk()
      .then(Pi => {
        console.log('>>> [loadPiSdk] Pi SDK loaded:', Pi);
        Pi.init({ version: '2.0', sandbox: nodeEnv === 'development' || nodeEnv === 'staging' });
        return Pi.nativeFeaturesList();
      })
      .then(features => {
        console.log('>>> [loadPiSdk] Pi native features:', features);
        setAdsSupported(features.includes("ad_network"));
      })
      .catch(err => console.error('>>> [loadPiSdk] Pi SDK load/init error:', err));
  }, [isSigningInUser]);

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
        adsSupported
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export default AppContextProvider;