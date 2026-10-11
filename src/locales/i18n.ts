import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Azerbaijani translations (Default)
import azCommon from './az/common.json';
import azNavigation from './az/navigation.json';
import azProducts from './az/products.json';
import azBranches from './az/branches.json';
import azAuth from './az/auth.json';
import azUi from './az/ui.json';

// English translations (Architecture ready)
import enCommon from './en/common.json';

// Russian translations (Architecture ready)
import ruCommon from './ru/common.json';

export const defaultNS = 'common';

export const resources = {
  az: {
    common: azCommon,
    navigation: azNavigation,
    products: azProducts,
    branches: azBranches,
    auth: azAuth,
    ui: azUi,
  },
  en: {
    common: enCommon,
  },
  ru: {
    common: ruCommon,
  },
} as const;

i18n.use(initReactI18next).init({
  lng: 'az',
  fallbackLng: 'az',
  defaultNS,
  resources,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;

