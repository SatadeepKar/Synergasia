import { createContext, useContext, useReducer } from 'react';

const AuthContext = createContext(null);

const initialState = {
  user: JSON.parse(localStorage.getItem('user') || 'null'),
};

function authReducer(state, action) {
  switch (action.type) {
    case 'LOGIN':
      localStorage.setItem('user', JSON.stringify(action.payload));
      return { user: action.payload };
    case 'LOGOUT':
      localStorage.removeItem('user');
      return { user: null };
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const login = (userData) => dispatch({ type: 'LOGIN', payload: userData });
  const logout = () => dispatch({ type: 'LOGOUT' });

  return (
    <AuthContext.Provider value={{ user: state.user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
