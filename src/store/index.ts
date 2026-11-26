import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { rootReducer } from './rootReducer';
import { baseApi } from '@/lib/api/baseApi';

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
});

// Refetch on window focus / reconnect for queries that opt in.
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
