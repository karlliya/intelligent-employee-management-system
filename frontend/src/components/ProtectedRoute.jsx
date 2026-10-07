import { Navigate, useLocation } from 'react-router-dom';
import { getToken, getUser } from '../lib/auth';

const ProtectedRoute = ({ children, roles }) => {
  const token = getToken();
  const user = getUser();
  const location = useLocation();

  if (!token) {
    const returnTo = location.pathname === '/attendance' ? '/attendance' : '/';
    return <Navigate to="/login" replace state={{ returnTo }} />;
  }

  if (roles && (!user || !roles.includes(user.role))) {
    return <Navigate to="/access-denied" replace state={{ from: location.pathname, roles }} />;
  }

  return children;
};

export default ProtectedRoute;
