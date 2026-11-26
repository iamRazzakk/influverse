import { combineReducers } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import { baseApi } from '@/lib/api/baseApi';

/**
 * Server data lives in the RTK Query cache (`api`). Only client state (auth session) is a slice.
 */
export const rootReducer = combineReducers({
  auth: authReducer,
  [baseApi.reducerPath]: baseApi.reducer,
});
