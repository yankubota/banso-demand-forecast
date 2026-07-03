// banso-tech-stack：useReducer + Context API（外部状態ライブラリ不使用）
import React, { createContext, useContext, useReducer } from 'react';
import { appReducer, initialState } from './reducer.js';

const StateCtx = createContext(null);
const DispatchCtx = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

/** 状態を読む（Provider外で呼ぶと明示的にエラー） */
export function useAppState() {
  const ctx = useContext(StateCtx);
  if (ctx === null) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}

/** dispatch を得る */
export function useAppDispatch() {
  const ctx = useContext(DispatchCtx);
  if (ctx === null) throw new Error('useAppDispatch must be used within AppProvider');
  return ctx;
}
